import { ServerEggVariable } from '@/api/server/types';
import updateStartupVariable from '@/api/server/updateStartupVariable';
import setDockerImage from '@/api/server/setSelectedDockerImage';
import reinstallServer from '@/api/server/reinstallServer';
import http from '@/api/http';

export interface Modpack {
    id: number;
    name: string;
    version: string;
    is_active: boolean;
    release_date: string;
    java_version: string;
    total_mods: number;
    logo_url: string;
    description: string;
    minimal_spec: string;
    recommend_spec: string;
    mc_version: string;
    core_type: string;
    server_download_url: string;
    client_download_url: string;
}

/**
 * 核心版本安装：面板下拉核心名 -> egg SERVER_TYPE 允许值。
 * 必须与全能 MC egg 的 SERVER_TYPE rules 中的选项一致（面板显示名与 egg 值不同）。
 */
export const CORE_SERVER_TYPES: Record<string, string> = {
    forge: 'Forge (模组)',
    paper: 'Paper (插件)',
    neoforge: 'NeoForge (模组)',
    fabric: 'Fabric (模组)',
};

/**
 * 核心版本列表：面板下拉核心名 -> 缓存文件名（/modpacks/core-versions/{name}.json）。
 * 缓存文件由宿主机 update.sh 每天从官方 API 拉取（一级版本列表，见 Eggs/Panel/README.md），
 * 前端**优先读缓存**；缓存不可用（404/未生成/格式异常）时 fallback 官方 API 直连（24h localStorage 缓存）。
 * NeoForge maven 域名大陆网络不可达，必须依赖 cron 缓存；其余核心缓存失败时也能直连 API 兜底。
 */
export const CORE_CACHE_FILES: Record<string, string> = {
    forge: 'forge.json',
    paper: 'paper.json',
    neoforge: 'neoforge.json',
    fabric: 'fabric.json',
};

/**
 * 核心版本列表（一级版本）。
 * 优先级：cron 缓存文件（/modpacks/core-versions/{core}.json，每天更新）→ 官方 API 直连（24h localStorage 缓存）。
 * Paper/Forge 有一级+二级：一级版本=API MC 版本列表（含 26.x，倒序）
 * NeoForge/Fabric 无二级：一级版本=全部版本（NeoForge 完整版本号 / Fabric loader 0.x.x），过滤 beta
 */
export const getCoreVersions = async (core: string): Promise<string[]> => {
    // 1) cron 缓存优先（nginx alias /modpacks/ -> storage/modpacks/）
    try {
        const cacheFile = CORE_CACHE_FILES[core];
        if (cacheFile) {
            const res = await fetch(`/modpacks/core-versions/${cacheFile}`, { credentials: 'same-origin' });
            if (res.ok) {
                const data = (await res.json()) as string[];
                if (Array.isArray(data) && data.length > 0) {
                    return data;
                }
            }
        }
    } catch {
        // 缓存不可用，走 API backup
    }

    // 2) 官方 API backup（24h localStorage 缓存，避免重复请求）
    switch (core) {
        case 'paper': {
            return withCache('versions:paper', async () => {
                const res = await apiFetch('https://fill.papermc.io/v3/projects/paper');
                const data = await res.json();
                // fill API versions 为 {分组: [具体版本...]}，展平得到全部 MC 版本（含 26.x）
                const seen = new Set<string>();
                for (const group of Object.keys(data.versions ?? {})) {
                    for (const v of data.versions[group] ?? []) {
                        seen.add(v as string);
                    }
                }
                return Array.from(seen);
            });
        }
        case 'forge': {
            return withCache('versions:forge', async () => {
                const xml = await fetchForgeMeta();
                const versions = Array.from(xml.querySelectorAll('version'))
                    .map((v) => v.textContent ?? '')
                    .filter((v) => v.includes('-'));
                // 一级版本 = 首个 '-' 前段（MC 版本，含 26.x），maven 正序 -> 倒序（最新到最旧）
                const seen = new Set<string>();
                for (const v of versions) {
                    seen.add(v.split('-')[0]);
                }
                return Array.from(seen).reverse();
            });
        }
        case 'neoforge': {
            return withCache('versions:neoforge', async () => {
                const xml = await fetchNeoForgeMeta();
                // 无二级版本：全部完整版本号（含 26.x，过滤 beta/alpha/rc/snapshot），倒序
                return Array.from(xml.querySelectorAll('version'))
                    .map((v) => v.textContent ?? '')
                    .filter((v) => !/-(beta|alpha|rc|snapshot)/i.test(v))
                    .reverse();
            });
        }
        case 'fabric': {
            return withCache('versions:fabric', async () => {
                const res = await apiFetch('https://meta.fabricmc.net/v2/versions/loader');
                const data = await res.json();
                // 无二级版本：全部 loader 版本（0.x.x）
                return Array.isArray(data)
                    ? data.map((i: { version?: string }) => i.version ?? '').filter(Boolean)
                    : [];
            });
        }
        default:
            throw new Error(`不支持的核心：${core}`);
    }
};

/** 官方 API 请求统一包装：429 限流识别为友好错误；25s 超时中止并提示。 */
const apiFetch = async (url: string, timeoutMs = 25000): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (res.status === 429) {
            const e = new Error('官方 API 请求过于频繁，请稍后再试');
            (e as Error & { rateLimited: boolean }).rateLimited = true;
            throw e;
        }
        if (!res.ok) {
            throw new Error(`请求失败 (${res.status})`);
        }
        return res;
    } catch (e) {
        if ((e as Error).name === 'AbortError') {
            throw new Error('官方 API 连接超时，请稍后再试');
        }
        throw e;
    } finally {
        clearTimeout(timer);
    }
};

// ---- localStorage 24h 缓存：一级版本/具体版本列表 + maven XML 文本，避免频繁请求官方 API ----
const CACHE_PREFIX = 'mlsg-core-cache:';
const CACHE_TTL = 24 * 60 * 60 * 1000;

const cacheGet = (key: string): string[] | null => {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        const obj = JSON.parse(raw) as { ts: number; data: string[] };
        if (Date.now() - obj.ts < CACHE_TTL) return obj.data;
    } catch {
        // 缓存损坏/隐私模式：忽略，按未命中处理
    }
    return null;
};

const cacheSet = (key: string, data: string[]): void => {
    try {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
        // 配额不足等：忽略
    }
};

const cacheTextGet = (key: string): string | null => {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        const obj = JSON.parse(raw) as { ts: number; data: string };
        if (Date.now() - obj.ts < CACHE_TTL) return obj.data;
    } catch {
        // 同上
    }
    return null;
};

const cacheTextSet = (key: string, data: string): void => {
    try {
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
        // 同上
    }
};

/** 带 24h localStorage 缓存的拉取：命中直接返回；成功后写入。 */
const withCache = async (key: string, fetcher: () => Promise<string[]>): Promise<string[]> => {
    const hit = cacheGet(key);
    if (hit) {
        return hit;
    }
    const data = await fetcher();
    cacheSet(key, data);
    return data;
};

/** maven-metadata.xml：前端内存缓存 + localStorage 文本缓存（切换核心/刷新页面不重复拉取）。 */
let forgeMetaXml: Document | null = null;
let neoforgeMetaXml: Document | null = null;

const fetchForgeMeta = async (): Promise<Document> => {
    if (forgeMetaXml) return forgeMetaXml;
    const cached = cacheTextGet('meta:forge');
    if (cached !== null) {
        forgeMetaXml = new DOMParser().parseFromString(cached, 'text/xml');
        return forgeMetaXml;
    }
    const res = await apiFetch('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
    const text = await res.text();
    cacheTextSet('meta:forge', text);
    forgeMetaXml = new DOMParser().parseFromString(text, 'text/xml');
    return forgeMetaXml;
};

const fetchNeoForgeMeta = async (): Promise<Document> => {
    if (neoforgeMetaXml) return neoforgeMetaXml;
    const cached = cacheTextGet('meta:neoforge');
    if (cached !== null) {
        neoforgeMetaXml = new DOMParser().parseFromString(cached, 'text/xml');
        return neoforgeMetaXml;
    }
    const res = await apiFetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
    const text = await res.text();
    cacheTextSet('meta:neoforge', text);
    neoforgeMetaXml = new DOMParser().parseFromString(text, 'text/xml');
    return neoforgeMetaXml;
};

/**
 * 按核心拉取具体版本（二级版本）列表。
 * Paper/Forge 有子版本（build 列表）；NeoForge/Fabric 无子版本（具体版本=所选核心版本本身，唯一）。
 * 抛出的错误若带 rateLimited 标记，表示官方 API 限流。
 */
export const getCoreBuilds = async (core: string, coreVersion: string): Promise<string[]> => {
    switch (core) {
        case 'paper': {
            return withCache(`builds:paper:${coreVersion}`, async () => {
                const res = await apiFetch(
                    `https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(coreVersion)}`
                );
                const data = await res.json();
                return Array.isArray(data.builds) ? data.builds.map(String) : [];
            });
        }
        case 'forge': {
            return withCache(`builds:forge:${coreVersion}`, async () => {
                const xml = await fetchForgeMeta();
                const versions = Array.from(xml.querySelectorAll('version')).map((v) => v.textContent ?? '');
                // 版本形如 "1.20.1-47.4.28"，匹配当前一级版本前缀，取 "-" 后段（build）。
                return versions
                    .filter((v) => v.startsWith(`${coreVersion}-`))
                    .map((v) => v.slice(coreVersion.length + 1));
            });
        }
        case 'neoforge':
        case 'fabric':
            // 无二级版本：具体版本即所选核心版本本身（唯一）
            return [coreVersion];
        default:
            throw new Error(`不支持的核心：${core}`);
    }
};

export interface ModpacksResponse {
    modpacks: Modpack[];
}

const MODPACKS_URL = '/api/client/modpacks';

export const getModpacks = async (): Promise<Modpack[]> => {
    // 通过面板后端读取本地挂载的 modpacks.json，浏览器不再直连 GitHub raw。
    // 后端会把 logo_url 改写为面板本地相对路径，避免外网依赖与 CORS 问题。
    const { data } = await http.get<ModpacksResponse>(MODPACKS_URL);
    return data && Array.isArray(data.modpacks) ? data.modpacks : [];
};

const stripInPrefix = (rule: string): string => (rule.startsWith('in:') ? rule.slice(3) : rule);

/**
 * 从 GUOCHAN_PACK_ID 变量的允许值列表（egg rules）中提取出
 * "数字前缀 -> 完整允许值" 的映射。允许值形如 "(1001) 愚者The Fool-0.2.2"。
 * 后端校验时要求发送的值必须命中这个允许列表，因此这里只使用数字前缀来匹配，
 * 而回填的值必须来自 egg 允许值本身（robust 而非 exact 匹配）。
 */
export const buildGuochanIdMap = (variables: ServerEggVariable[]): Map<number, string> => {
    const packVar = variables.find((v) => v.envVariable === 'GUOCHAN_PACK_ID');
    const map = new Map<number, string>();

    if (!packVar) {
        return map;
    }

    for (const raw of packVar.rules) {
        // in: 规则是一整串逗号分隔的允许值（如 "(1000) 未启用,(1001) 愚者The Fool-0.3.0,..."），
        // 必须先按逗号拆成单个选项，再为每个 (N) 前缀建立映射（robust 匹配，忽略前缀后的文字）。
        for (const option of stripInPrefix(raw).split(',')) {
            const trimmed = option.trim();
            const match = trimmed.match(/^\((\d+)\)/);
            if (match) {
                map.set(parseInt(match[1], 10), trimmed);
            }
        }
    }

    return map;
};

/**
 * 找到 SERVER_TYPE 变量中允许的 "GuoChan" 开头的值（例如 "GuoChan (整合包)"）。
 * 找不到返回 null。
 */
export const matchGuoChanServerType = (variables: ServerEggVariable[]): string | null => {
    const typeVar = variables.find((v) => v.envVariable === 'SERVER_TYPE');
    if (!typeVar) {
        return null;
    }

    for (const raw of typeVar.rules) {
        // SERVER_TYPE 的 in: 规则同样是一整串逗号分隔的选项，需拆分后再匹配 GuoChan 开头。
        for (const option of stripInPrefix(raw).split(',')) {
            const trimmed = option.trim();
            if (trimmed.startsWith('GuoChan')) {
                return trimmed;
            }
        }
    }

    return null;
};

/**
 * 根据模组包 id，从 egg 允许值中匹配对应的完整值。匹配不到返回 null。
 */
export const matchGuoChanPackId = (variables: ServerEggVariable[], packId: number): string | null => {
    const map = buildGuochanIdMap(variables);
    return map.get(packId) ?? null;
};

/**
 * Java 版本 -> yolks 镜像路径映射。
 * 对应全能 MC egg 的 docker_images（array_values 为镜像路径本身，
 * 后端 SetDockerImageRequest 用 Rule::in 校验该值，因此必须是 egg 内已配置的路径）。
 * 写全套（8/11/16/17/18/21/25），未来 metadata 新增版本时无需再改代码。
 */
export const JAVA_IMAGE_MAP: Record<string, string> = {
    '8': 'ghcr.io/pterodactyl/yolks:java_8',
    '11': 'ghcr.io/pterodactyl/yolks:java_11',
    '16': 'ghcr.io/pterodactyl/yolks:java_16',
    '17': 'ghcr.io/pterodactyl/yolks:java_17',
    '18': 'ghcr.io/pterodactyl/yolks:java_18',
    '21': 'ghcr.io/pterodactyl/yolks:java_21',
    '25': 'ghcr.io/pterodactyl/yolks:java_25',
};

/**
 * 根据模组包的 java_version 返回对应 yolks 镜像路径；无映射返回 null。
 */
export const matchJavaImage = (pack: Modpack): string | null =>
    JAVA_IMAGE_MAP[pack.java_version] ?? null;

/**
 * 一键安装完整流程：
 * 1. 切换服务器类型为 GuoChan 模式
 * 2. 设置模组包 ID
 * 3. 按模组包的 java_version 切换对应的 Java 镜像（无映射则跳过，不阻断）
 * 4. 触发服务器重装
 */
export const installModpack = async (
    uuid: string,
    variables: ServerEggVariable[],
    pack: Modpack
): Promise<void> => {
    const serverType = matchGuoChanServerType(variables);
    if (!serverType) {
        throw new Error('当前 egg 未提供 GuoChan 服务器类型，无法切换。');
    }

    const packValue = matchGuoChanPackId(variables, pack.id);
    if (!packValue) {
        throw new Error(`模组包 ID (${pack.id}) 尚未在当前 egg 的允许列表中登记，无法安装。请先更新 egg。`);
    }

    await updateStartupVariable(uuid, 'SERVER_TYPE', serverType);
    await updateStartupVariable(uuid, 'GUOCHAN_PACK_ID', packValue);

    const javaImage = matchJavaImage(pack);
    if (javaImage) {
        // 切换 Java 镜像到模组包要求的版本。
        await setDockerImage(uuid, javaImage);
    }

    await reinstallServer(uuid);
};

/**
 * 找到 SERVER_TYPE 变量中允许的指定核心值（例如 "Paper (插件)"）。
 * 以面板核心名（forge/paper/neoforge/fabric）匹配允许值中对应前缀开头。
 */
export const matchCoreServerType = (variables: ServerEggVariable[], core: string): string | null => {
    const display = CORE_SERVER_TYPES[core];
    if (!display) {
        return null;
    }

    const typeVar = variables.find((v) => v.envVariable === 'SERVER_TYPE');
    if (!typeVar) {
        return null;
    }

    // display 是完整 egg 值（如 "Paper (插件)"），在允许值中精确匹配（允许前后空格）。
    for (const raw of typeVar.rules) {
        for (const option of stripInPrefix(raw).split(',')) {
            if (option.trim() === display) {
                return display;
            }
        }
    }

    return null;
};

/**
 * 一键安装具体核心版本流程：
 * 1. 切换服务器类型为目标核心（Forge/Paper/NeoForge/Fabric）
 * 2. 写入手动游戏版本（MINECRAFT_VERSION_MANUAL，🔴【高级】）——取所选核心版本
 *    （Paper/Forge 即 MC 版本；NeoForge/Fabric 为完整版本号/loader 版本，egg 侧自行解析）
 * 3. 写入具体版本号（BUILD_NUMBER，🧩【模组】）
 * 4. 触发服务器重装
 */
export const installCoreVersion = async (
    uuid: string,
    variables: ServerEggVariable[],
    core: string,
    coreVersion: string,
    buildNumber: string
): Promise<void> => {
    const serverType = matchCoreServerType(variables, core);
    if (!serverType) {
        throw new Error(`当前 egg 未提供 ${CORE_SERVER_TYPES[core] ?? core} 服务器类型，无法切换。`);
    }

    await updateStartupVariable(uuid, 'SERVER_TYPE', serverType);
    await updateStartupVariable(uuid, 'MINECRAFT_VERSION_MANUAL', coreVersion);
    await updateStartupVariable(uuid, 'BUILD_NUMBER', buildNumber);

    await reinstallServer(uuid);
};
