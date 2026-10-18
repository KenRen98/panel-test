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
    /** 服务器本地 acf 记录的下载/更新时间（秒），用于与 time_updated 对比判断"有更新" */
    localUpdated?: number;
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
 * 服务器本地已下载的 workshop id → acf 记录的下载/更新时间（秒）。
 *
 * steamcmd 下载完成后会生成 appworkshop_*.acf（饥荒为 appworkshop_322330.acf），
 * 其 "WorkshopItemsInstalled" 段落里每个数字键就是一个已下载 mod 的 id，
 * 每个块内带 timeupdated 字段；dst_auto_mods.sh 已把该文件复制到
 * ugc_mods/server/Master/ 与 Caves/ 下。
 * 因此"是否已下载"= 读 acf 文件、提取其中的 id 集合；timeupdated 可再与
 * Steam API 的 time_updated 对比判断"模组是否有更新"。
 * acf 不存在 → 一个 mod 都未下载过 → 返回空 Map。
 */
export const getInstalledModInfo = async (uuid: string): Promise<Map<string, number>> => {
    const key = `installed:${uuid}`;
    const hit = cacheGet<Map<string, number>>(key, 30_000);
    if (hit) return hit;
    let content: string;
    try {
        content = await getFileContents(uuid, 'ugc_mods/server/Master/appworkshop_322330.acf');
    } catch (e) {
        // 文件不存在（尚未下载过任何 mod）或读取失败 → 视为未下载
        console.warn('[getInstalledModInfo] 读取 acf 失败，视为未下载任何模组', e);
        return new Map();
    }
    const map = new Map<string, number>();
    const blockRe = /^\s*"(\d{5,})"\s*\{([\s\S]*?)\}/gm;
    const timeRe = /"timeupdated"\s*"(\d+)"/;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(content)) !== null) {
        const tm = timeRe.exec(m[2]);
        map.set(m[1], tm ? Number(tm[1]) : 0);
    }
    cacheSet(key, map);
    return map;
};

/**
 * 待生效标记统一文件（记录所有已保存但尚未被开服脚本合并进 modoverrides.lua 的 mod id）。
 * 内容为 JSON 数组；开服脚本合并完成后删除该文件 → 前端据此判断"待重启生效"状态。
 */
const PENDING_MARKS_FILE = `${PENDING_DIR}/pending_ids.json`;

/** 保存配置时把 mod id 记入统一待生效标记文件（不存在则新建，读改写追加） */
export const markPendingConfig = async (uuid: string, id: string): Promise<void> => {
    let ids: string[] = [];
    try {
        const raw = await getFileContentsQuiet(uuid, PENDING_MARKS_FILE);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            ids = parsed.filter((x): x is string => typeof x === 'string');
        }
    } catch (e) {
        // 文件不存在或解析失败 → 从空列表开始
    }
    if (!ids.includes(id)) {
        ids.push(id);
    }
    await saveFileContents(uuid, PENDING_MARKS_FILE, JSON.stringify(ids));
};

/** 读取待生效标记集合（统一文件 pending_ids.json 中的 id 数组）。文件不存在 → 空集合。 */
export const getPendingMarkedIds = async (uuid: string): Promise<Set<string>> => {
    try {
        const raw = await getFileContentsQuiet(uuid, PENDING_MARKS_FILE);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((x): x is string => typeof x === 'string'));
    } catch (e) {
        return new Set();
    }
};

/**
 * 静默读取文件内容（跳过全局顶部进度条）：与 getFileContents 参数完全一致，
 * 仅多带 X-Doubao-Skip-Progress 头。
 * 用于抽屉/弹窗内的静默加载（如模组管理弹窗读取 schema / pending），
 * 避免打开弹窗时页面顶部冒出全局进度条——弹窗自己展示局部加载态。
 */
const getFileContentsQuiet = async (uuid: string, file: string): Promise<string> => {
    const { data } = await http.get(`/api/client/servers/${uuid}/files/contents`, {
        params: { file },
        transformResponse: (res) => res,
        responseType: 'text',
        headers: { 'X-Doubao-Skip-Progress': '1' },
    });
    return data;
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
    // 只缓存"读成功"的结果（schema 结构低频变化，5min 足够）；
    // 读失败/文件不存在 → null 不缓存，下次进页真实重读——否则瞬时失败会
    // 让模组管理页的管理按钮/可编辑徽章 5 分钟内一直消失。
    const key = `schema:${uuid}:${id}`;
    const hit = cacheGet<DstModSchema>(key, 300_000);
    if (hit) return hit;
    try {
        const content = await getFileContentsQuiet(uuid, `${SCHEMA_DIR}/${id}.json`);
        const parsed = JSON.parse(content) as DstModSchema;
        if (!parsed || !Array.isArray(parsed.items)) {
            return null;
        }
        cacheSet(key, parsed);
        return parsed;
    } catch (e) {
        console.warn(`[getModSchema] ${id} schema 读取失败`, e);
        return null;
    }
};

/**
 * 读取某 mod 已保存的 pending 设置（用户改过但未重启的值）。
 * 无 pending → null。返回 { name: value } 映射。
 */
export const getPendingConfig = async (uuid: string, id: string): Promise<Record<string, string | number | boolean> | null> => {
    try {
        const content = await getFileContentsQuiet(uuid, `${PENDING_DIR}/${id}.json`);
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
