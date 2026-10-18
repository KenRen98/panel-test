import http from '@/api/http';
import { ServerEggVariable } from '@/api/server/types';
import saveFileContents from '@/api/server/files/saveFileContents';
import deleteFiles from '@/api/server/files/deleteFiles';
import { getEggCapabilities } from '@/api/server/eggCapabilities';

/**
 * 世界设置（worldgenoverride.lua 编辑）文件 API。
 *
 * 数据流：
 *  - 读取：直接读 Master / Caves 下的 worldgenoverride.lua 原文（相对服务器根目录）。
 *  - 保存：前端在原文上逐行替换已知 key + 追加缺失 key，整体写回两个文件。
 *  - 重置世界：删除 Master|Caves 各 save/backup 四个目录（服务器需处于关闭状态）。
 *
 * 能力门控：egg 通过 EGG_CAPABILITIES 声明 "world-settings"（连字符写法，
 * 与 dst_mod_manager / mod_install-dst 一致；冒号会被 Laravel 规则解析混淆，禁用）。
 */

const DST_WORLD_DIR = 'DoNotStarveTogether/config/server';
export const WG_MASTER_PATH = `${DST_WORLD_DIR}/Master/worldgenoverride.lua`;
export const WG_CAVES_PATH = `${DST_WORLD_DIR}/Caves/worldgenoverride.lua`;

/** 重置世界删除的四个目录（相对服务器根目录） */
export const RESET_DIRS = [
    `${DST_WORLD_DIR}/Master/save`,
    `${DST_WORLD_DIR}/Master/backup`,
    `${DST_WORLD_DIR}/Caves/save`,
    `${DST_WORLD_DIR}/Caves/backup`,
];

/** 静默读取文件内容（跳过全局顶部进度条，页面自己展示局部加载态） */
const getFileContentsQuiet = async (uuid: string, file: string): Promise<string> => {
    const { data } = await http.get(`/api/client/servers/${uuid}/files/contents`, {
        params: { file },
        transformResponse: (res) => res,
        responseType: 'text',
        headers: { 'X-Doubao-Skip-Progress': '1' },
    });
    return data;
};

export interface WorldgenFiles {
    master: string;
    caves: string;
}

/**
 * 读取两个 shard 的 worldgenoverride.lua 原文。
 * 任一文件不存在 / 读取失败 → 该 shard 返回空字符串（组件按"全默认值"处理）。
 */
export const getWorldgenFiles = async (uuid: string): Promise<WorldgenFiles> => {
    const [master, caves] = await Promise.all([
        getFileContentsQuiet(uuid, WG_MASTER_PATH).catch(() => ''),
        getFileContentsQuiet(uuid, WG_CAVES_PATH).catch(() => ''),
    ]);
    return { master, caves };
};

/** 写回两个 shard 的 worldgenoverride.lua（整体覆盖） */
export const saveWorldgenFiles = async (uuid: string, files: WorldgenFiles): Promise<void> => {
    await Promise.all([
        saveFileContents(uuid, WG_MASTER_PATH, files.master),
        saveFileContents(uuid, WG_CAVES_PATH, files.caves),
    ]);
};

/**
 * 重置世界：删除 Master|Caves 的 save/backup 四个目录。
 * 调用前组件必须先确认服务器处于关闭状态（status === 'offline'）。
 */
export const resetWorld = async (uuid: string): Promise<void> => {
    await deleteFiles(uuid, '/', RESET_DIRS);
};

/** 是否具备世界设置能力（用于侧边栏门控与页面兜底提示） */
export const hasWorldSettingsCapability = (variables?: ServerEggVariable[]): boolean => {
    if (!variables) {
        return false;
    }
    return getEggCapabilities(variables).includes('world-settings');
};
