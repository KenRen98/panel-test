import { ServerEggVariable } from '@/api/server/types';
import updateStartupVariable from '@/api/server/updateStartupVariable';
import http from '@/api/http';
import getFileContents from '@/api/server/files/getFileContents';
import saveFileContents from '@/api/server/files/saveFileContents';
import deleteFiles from '@/api/server/files/deleteFiles';

/**
 * Steam 创意工坊模组安装功能（模组安装）。
 *
 * 游戏模式由 EGG_CAPABILITIES 变量侦测（值为逗号分隔的能力列表）：
 *   - 含 "mod_install-pal" → 幻兽帕鲁（appid 由后端映射，前端不感知）
 *   - 含 "mod_install-dst" → 饥荒联机版
 *   - 只含 "mod_install" 或其它值 → 不支持的游戏
 * 能力值统一用连字符 "-" 分隔后缀，不用冒号 ":"：
 * Laravel 校验规则字符串里冒号是规则参数语法（如 max:20），值中带冒号易与规则解析混淆。
 * appid 始终只在后端维护，前端只传 mode，避免向用户暴露 appid。
 */

/** 支持的游戏模式（与后端 SteamWorkshopController::APPID_MAP 对齐） */
export type SteamModMode = 'pal' | 'dst';

// ============================================================
// 模块级内存缓存（跨页面挂载存活；React Router 切页不刷新页面，可命中）
// 只缓存低频变化数据：详情 60s / acf 已下载集合 30s / schema 5min
// ============================================================
const _cache = new Map<string, { at: number; data: unknown }>();
const cacheGet = <T>(key: string, ttlMs: number): T | null => {
    const e = _cache.get(key);
    if (!e) return null;
    if (Date.now() - e.at > ttlMs) {
        _cache.delete(key);
        return null;
    }
    return e.data as T;
};
const cacheSet = (key: string, data: unknown): void => {
    _cache.set(key, { at: Date.now(), data });
};

/**
 * Steam 缩略图尺寸压缩：steamstatic 的 items 原图支持 ?imw/&imh 缩放参数，
 * 卡片展示（56px）用原图（几十 KB）浪费流量，压到 256px 后每张 ~几 KB。
 * 只处理无查询参数、且属于已知图床的 items 图 URL，其余原样放行（防呆）。
 */
export const optimizeSteamPreviewUrl = (url: string): string => {
    if (!url || url.includes('?')) return url;
    if (/^https?:\/\/(cdn\.akamai|cdn\.cloudflare|steamcdn-a)\.steamstatic\.com\/steamcommunity\/public\/images\/items\//i.test(url)) {
        return `${url}?imw=256&imh=256`;
    }
    return url;
};

/** 从 EGG_CAPABILITIES 解析模组安装模式；不支持返回 null（只认连字符写法） */
export const resolveSteamModMode = (variables?: ServerEggVariable[]): SteamModMode | null => {
    if (!variables) {
        return null;
    }
    const caps = getEggCapabilitiesRaw(variables);
    if (caps.includes('mod_install-pal')) return 'pal';
    if (caps.includes('mod_install-dst')) return 'dst';
    return null;
};

/** 是否具备模组安装能力（用于侧边栏门控：有 mod_install 前缀能力即可） */
export const hasSteamModCapability = (variables?: ServerEggVariable[]): boolean => {
    if (!variables) {
        return false;
    }
    return getEggCapabilitiesRaw(variables).some((c) => c.startsWith('mod_install'));
};

/** 是否具备 DST 模组管理能力（用于模组管理页门控） */
export const hasDstModManagerCapability = (variables?: ServerEggVariable[]): boolean => {
    if (!variables) {
        return false;
    }
    return getEggCapabilitiesRaw(variables).includes('dst_mod_manager');
};

/** 复用 eggCapabilities 的取值逻辑，但保留完整能力串（含 - 后缀） */
const getEggCapabilitiesRaw = (variables: ServerEggVariable[]): string[] => {
    const capVar = variables.find((v) => v.envVariable === 'EGG_CAPABILITIES');
    if (!capVar) {
        return [];
    }
    const raw = capVar.serverValue || capVar.defaultValue || '';
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
};

export interface SteamMod {
    id: string;
    title: string;
    preview_url: string;
    short_description: string;
    subscriptions: number;
    time_updated: number;
    /** 服务器本地是否已下载（GetDetails 不返回；由服务器端目录扫描提供，暂缺时恒为 undefined） */
    downloaded?: boolean;
}

export interface SteamSearchResult {
    items: SteamMod[];
    total: number;
    page: number;
    pages: number;
    mode: SteamModMode;
}

/**
 * 搜索创意工坊模组（走面板后端代理，key 不进入前端）。
 * page 从 1 开始；后端每页固定 9 条（一行三个 × 三行）。
 */
export const searchSteamMods = async (mode: SteamModMode, q: string, page: number): Promise<SteamSearchResult> => {
    const params: Record<string, string> = { mode, page: String(page) };
    if (q.trim() !== '') {
        params.q = q.trim();
    }
    const { data } = await http.get<SteamSearchResult>('/api/client/mods/steam/search', { params });
    return data;
};

/** 已安装模组批量详情（GetDetails 一次取全部元信息；卡片展示不解码服务器本地文件） */
export const getSteamModDetails = async (mode: SteamModMode, ids: string[]): Promise<SteamMod[]> => {
    const pure = ids
        .map((s) => String(s).trim().replace(/^workshop-/i, ''))
        .filter((s) => /^\d{5,}$/.test(s));
    if (pure.length === 0) {
        return [];
    }
    const key = `details:${mode}:${pure.join(',')}`;
    const hit = cacheGet<SteamMod[]>(key, 60_000);
    if (hit) return hit;
    const { data } = await http.post<{ items: SteamMod[] }>('/api/client/mods/steam/details', { mode, ids: pure });
    const items = data.items || [];
    cacheSet(key, items);
    return items;
};

/**
 * 服务器本地已下载的 workshop id 集合。
 *
 * steamcmd 下载完成后会生成 appworkshop_*.acf（饥荒为 appworkshop_322330.acf），
 * 其 "WorkshopItemsInstalled" 段落里每个数字键就是一个已下载 mod 的 id；
 * dst_auto_mods.sh 已把该文件复制到 ugc_mods/server/Master/ 与 Caves/ 下。
 * 因此"是否已下载"= 读 acf 文件、提取其中的 id 集合，比扫 mods 目录快得多。
 * acf 不存在 → 一个 mod 都未下载过 → 返回空集合。
 */
export const getInstalledModIds = async (uuid: string): Promise<Set<string>> => {
    const key = `installed:${uuid}`;
    const hit = cacheGet<Set<string>>(key, 30_000);
    if (hit) return hit;
    let content: string;
    try {
        content = await getFileContents(uuid, 'ugc_mods/server/Master/appworkshop_322330.acf');
    } catch (e) {
        // 文件不存在（尚未下载过任何 mod）或读取失败 → 视为未下载
        console.warn('[getInstalledModIds] 读取 acf 失败，视为未下载任何模组', e);
        return new Set();
    }
    const ids = new Set<string>();
    const re = /^\s*"(\d{5,})"\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
        ids.add(m[1]);
    }
    cacheSet(key, ids);
    return ids;
};

/**
 * 更新 MODS_LIST 变量（逗号分隔的 mod id）。
 * 仅当 MODS_LIST 变量存在于该服务器且 user_editable 时才调用，否则抛错。
 * 返回更新后的变量（供调用方同步 store，保证刷新/重挂载后显示一致）。
 */
export const saveModsList = async (
    uuid: string,
    variables: ServerEggVariable[],
    ids: string[]
): Promise<ServerEggVariable> => {
    const varDef = variables.find((v) => v.envVariable === 'MODS_LIST');
    if (!varDef) {
        throw new Error('当前 egg 未提供 MODS_LIST 变量，无法保存模组列表。');
    }
    if (!varDef.isEditable) {
        throw new Error('MODS_LIST 变量不可编辑，无法保存模组列表。');
    }
    const [updated] = await updateStartupVariable(uuid, 'MODS_LIST', ids.join(','));
    return updated;
};

// ============================================================
// 阶段二：模组设置管理
// 数据流：dump_schema.lua（开服时）生成 ugc_mods/schema/<id>.json 供表单渲染；
//         前端保存只写 ugc_mods/pending_config/<id>.json（JSON）；
//         下次开服 dst_auto_mods.sh 用 merge_config.lua 合并 pending 覆盖默认值，
//         重新生成 modoverrides.lua（Master + Caves）。前端不解析/不写 Lua。
// ============================================================

export interface DstModOption {
    label?: string;
    data: string | number | boolean;
}

export interface DstModSchemaItem {
    name: string;
    label?: string;
    hover?: string;
    type: 'toggle' | 'enum' | 'slider' | 'text';
    default?: string | number | boolean;
    options?: DstModOption[];
    min?: number;
    max?: number;
}

export interface DstModSchema {
    ok: boolean;
    items: DstModSchemaItem[];
}

const SCHEMA_DIR = 'ugc_mods/schema';
const PENDING_DIR = 'ugc_mods/pending_config';

/**
 * 读取某 mod 的设置 schema（开服时由 dump_schema.lua 生成）。
 * 文件不存在 / 解析失败 → 返回 null（调用方按"需重启/不可编辑"处理）。
 */
export const getModSchema = async (uuid: string, id: string): Promise<DstModSchema | null> => {
    const key = `schema:${uuid}:${id}`;
    const hit = cacheGet<DstModSchema | null>(key, 300_000);
    if (hit !== undefined) return hit;
    try {
        const content = await getFileContents(uuid, `${SCHEMA_DIR}/${id}.json`);
        const parsed = JSON.parse(content) as DstModSchema;
        if (!parsed || !Array.isArray(parsed.items)) {
            cacheSet(key, null);
            return null;
        }
        cacheSet(key, parsed);
        return parsed;
    } catch (e) {
        console.warn(`[getModSchema] ${id} schema 读取失败`, e);
        cacheSet(key, null);
        return null;
    }
};

/**
 * 读取某 mod 已保存的 pending 设置（用户改过但未重启的值）。
 * 无 pending → null。返回 { name: value } 映射。
 */
export const getPendingConfig = async (uuid: string, id: string): Promise<Record<string, string | number | boolean> | null> => {
    try {
        const content = await getFileContents(uuid, `${PENDING_DIR}/${id}.json`);
        const parsed = JSON.parse(content) as { configuration_options?: Record<string, string | number | boolean> };
        return parsed?.configuration_options ?? null;
    } catch (e) {
        console.warn(`[getPendingConfig] ${id} pending 读取失败`, e);
        return null;
    }
};

/**
 * 保存某 mod 的设置值 → 写 pending JSON。
 * 下次开服脚本合并进 modoverrides.lua（Master + Caves）。
 */
export const savePendingConfig = async (
    uuid: string,
    id: string,
    values: Record<string, string | number | boolean>
): Promise<void> => {
    const payload = JSON.stringify({ configuration_options: values });
    await saveFileContents(uuid, `${PENDING_DIR}/${id}.json`, payload);
};

/**
 * 移除模组时清理其 schema / pending 辅助文件（失败忽略——文件可能不存在）。
 */
export const removeModData = async (uuid: string, id: string): Promise<void> => {
    try {
        await deleteFiles(uuid, '/', [`${SCHEMA_DIR}/${id}.json`, `${PENDING_DIR}/${id}.json`]);
    } catch (e) {
        console.warn(`[removeModData] ${id} 清理辅助文件失败`, e);
    }
};
