import { getEggCapabilities } from '@/api/server/eggCapabilities';
import { ServerEggVariable } from '@/api/server/types';

/**
 * 是否具备快捷指令（MC 管理）能力。
 * egg 通过 EGG_CAPABILITIES 声明 "mc-manager"，用于侧边栏门控。
 */
export const hasMcManagerCapability = (variables?: ServerEggVariable[]): boolean => {
    if (!variables) {
        return false;
    }
    return getEggCapabilities(variables).includes('mc-manager');
};
