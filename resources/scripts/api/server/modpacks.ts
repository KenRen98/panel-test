import { ServerEggVariable } from '@/api/server/types';
import updateStartupVariable from '@/api/server/updateStartupVariable';
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
 * 一键安装完整流程：
 * 1. 切换服务器类型为 GuoChan 模式
 * 2. 设置模组包 ID
 * 3. 触发服务器重装
 */
export const installModpack = async (
    uuid: string,
    variables: ServerEggVariable[],
    packId: number
): Promise<void> => {
    const serverType = matchGuoChanServerType(variables);
    if (!serverType) {
        throw new Error('当前 egg 未提供 GuoChan 服务器类型，无法切换。');
    }

    const packValue = matchGuoChanPackId(variables, packId);
    if (!packValue) {
        throw new Error(`模组包 ID (${packId}) 尚未在当前 egg 的允许列表中登记，无法安装。请先更新 egg。`);
    }

    await updateStartupVariable(uuid, 'SERVER_TYPE', serverType);
    await updateStartupVariable(uuid, 'GUOCHAN_PACK_ID', packValue);
    await reinstallServer(uuid);
};
