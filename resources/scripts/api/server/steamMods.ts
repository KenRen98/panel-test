import { ServerEggVariable } from '@/api/server/types';
import updateStartupVariable from '@/api/server/updateStartupVariable';
import http from '@/api/http';

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

/**
 * 更新 MODS_LIST 变量（逗号分隔的 mod id）。
 * 仅当 MODS_LIST 变量存在于该服务器且 user_editable 时才调用，否则抛错。
 */
export const saveModsList = async (
    uuid: string,
    variables: ServerEggVariable[],
    ids: string[]
): Promise<void> => {
    const varDef = variables.find((v) => v.envVariable === 'MODS_LIST');
    if (!varDef) {
        throw new Error('当前 egg 未提供 MODS_LIST 变量，无法保存模组列表。');
    }
    if (!varDef.isEditable) {
        throw new Error('MODS_LIST 变量不可编辑，无法保存模组列表。');
    }
    await updateStartupVariable(uuid, 'MODS_LIST', ids.join(','));
};
