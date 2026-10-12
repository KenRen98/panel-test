import { ServerEggVariable } from '@/api/server/types';

/**
 * 能力声明变量名。
 * egg 通过该变量声明自己支持哪些扩展模块（如 "modpack"），
 * 与业务数据变量（如 GUOCHAN_PACK_ID）解耦。扩展代码只读，从不写入。
 */
export const EGG_CAPABILITIES_VARIABLE = 'EGG_CAPABILITIES';

/**
 * 从 server 的 variables 里提取 EGG_CAPABILITIES，返回能力字符串集合。
 * 找不到该变量或值为空时返回空数组。
 */
export const getEggCapabilities = (variables?: ServerEggVariable[]): string[] => {
    if (!variables) {
        return [];
    }

    const capVar = variables.find((v) => v.envVariable === EGG_CAPABILITIES_VARIABLE);
    if (!capVar) {
        return [];
    }

    // 取当前生效值优先，回退到默认值；按逗号拆分并去掉空项。
    const raw = capVar.serverValue || capVar.defaultValue || '';
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
};

/**
 * 判断 server 是否具备某项能力（eg. hasCapability(variables, 'modpack')）。
 */
export const hasCapability = (variables?: ServerEggVariable[], capability?: string): boolean => {
    if (!capability) {
        return false;
    }

    return getEggCapabilities(variables).includes(capability);
};
