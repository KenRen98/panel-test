import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components/macro';
import tw, { theme } from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Button from '@/components/elements/Button';
import { ServerContext } from '@/state/server';
import { httpErrorToHuman } from '@/api/http';
import {
    getWorldgenFiles,
    saveWorldgenFiles,
    resetWorld,
    hasWorldSettingsCapability,
} from '@/api/server/worldSettings';
import { CAT_ORDER, CAT_ZH, WORLDGEN_SETTINGS, WorldgenSetting } from './worldSettingsData';

// 已知 key 集合（数据表全部 61 项；解析/写回只认这些 key，其余原样保留）
const WORLDGEN_KEYS = new Set(WORLDGEN_SETTINGS.map((s) => s.key));

// ===== Lua 解析：提取数据表已知 key 的当前值（值必须是字符串字面量） =====
const parseKnown = (lua: string): Record<string, string> => {
    const out: Record<string, string> = {};
    const re = /(^|\n)[ \t]*([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*"([^"]*)"[ \t]*,?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lua)) !== null) {
        if (WORLDGEN_KEYS.has(m[2])) {
            out[m[2]] = m[3];
        }
    }
    return out;
};

// ===== Lua 写回：逐行替换已知 key，文件缺失的 key 追加到最后一个 key 行之后；其余原样 =====
// preset：仅当文件为空/无 key 行时用于重建标准结构（master=SURVIVAL_TOGETHER，caves=DST_CAVE）
const applyOverrides = (lua: string, overrides: Record<string, string>, preset = 'SURVIVAL_TOGETHER'): string => {
    const lines = lua.split('\n');
    const seen: Record<string, boolean> = {};
    let lastKeyIdx = -1;
    let lastIndent = '  ';
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^([ \t]*)([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*"([^"]*)"([ \t]*,?[ \t]*.*)$/);
        if (m && WORLDGEN_KEYS.has(m[2]) && overrides[m[2]] !== undefined) {
            lines[i] = m[1] + m[2] + ' = "' + overrides[m[2]] + '"' + m[4];
            seen[m[2]] = true;
            lastKeyIdx = i;
            lastIndent = m[1];
        }
    }
    // 文件里没有的 key：追加到最后一个 key 行之后（补逗号保持 Lua 语法）
    const add: string[] = [];
    for (const k of Object.keys(overrides)) {
        if (WORLDGEN_KEYS.has(k) && !seen[k]) {
            add.push(lastIndent + k + ' = "' + overrides[k] + '",');
        }
    }
    if (add.length && lastKeyIdx >= 0) {
        if (!/,\s*$/.test(lines[lastKeyIdx])) {
            lines[lastKeyIdx] += ',';
        }
        lines.splice(lastKeyIdx + 1, 0, ...add);
        return lines.join('\n');
    }
    if (add.length) {
        // 文件为空 / 无任何 key 行 → 重建标准结构（写入全部 key，tab 缩进对齐模板）
        const body = Object.keys(overrides)
            .map((k) => `\t\t${k} = "${overrides[k]}",`)
            .join('\n');
        return `return {\n\toverride_enabled = true,\n\tpreset = "${preset}",\n\toverrides = {\n${body}\n\t}\n}`;
    }
    return lua;
};

// ===== 样式（对齐生产：深蓝主题，卡片/下拉照 demo 最终版） =====

const HeaderL = styled.div`
    ${tw`flex items-center gap-3`};
`;

const IconBlock = styled.div`
    ${tw`w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center text-primary-50 flex-shrink-0`};
`;

const HeaderR = styled.div`
    ${tw`ml-auto flex flex-col items-end gap-1.5 flex-wrap`};
`;

// 统计胶囊：共 N 项 · 已修改 N 项
const StatsPill = styled.div`
    ${tw`inline-flex items-center gap-1.5 rounded-full border border-neutral-600 px-3.5 text-xs text-neutral-400`};
    background: ${theme`colors.neutral.700`.toString()};
    line-height: 26px;
    & > b {
        ${tw`text-neutral-100 font-semibold`};
    }
`;

// 提示条（对齐模组安装 RestartHint）：多模式——默认橙黄(info) / 保存成功绿(success) / 错误红(error)
const RestartHint = styled.div<{ mode?: 'info' | 'success' | 'error' }>`
    ${tw`px-2.5 leading-[21px] rounded-lg border text-xs whitespace-nowrap flex items-center gap-1.5`};
    background: ${(props) =>
        props.mode === 'success'
            ? 'rgba(34, 197, 94, 0.08)'
            : props.mode === 'error'
            ? 'rgba(239, 68, 68, 0.08)'
            : 'rgba(255, 170, 0, 0.08)'};
    border-color: ${(props) =>
        props.mode === 'success'
            ? 'rgba(34, 197, 94, 0.35)'
            : props.mode === 'error'
            ? 'rgba(239, 68, 68, 0.35)'
            : 'rgba(255, 170, 0, 0.35)'};
    color: ${(props) =>
        props.mode === 'success'
            ? 'hsl(145, 70%, 68%)'
            : props.mode === 'error'
            ? 'hsl(0, 80%, 72%)'
            : 'hsl(40, 90%, 72%)'};
`;

// ===== 控制行：切换（左）+ 动作按钮（右） =====
const CtrlRow = styled.div`
    ${tw`flex items-center gap-3.5 flex-wrap`};
    margin-top: 6px;
`;

const ModeBar = styled.div`
    ${tw`flex items-center gap-0.5 rounded-lg border border-neutral-600 p-0.5 h-[34px]`};
    background: ${theme`colors.neutral.700`.toString()};
    width: max-content;
`;

const ModeBtn = styled.button<{ active?: boolean }>`
    ${tw`h-full px-4 rounded-md text-[13px] cursor-pointer border-0 transition-colors duration-150`};
    font-family: inherit;
    color: ${(props) => (props.active ? '#f0f6ff' : '#aeb8cb')};
    background: ${(props) => (props.active ? theme`colors.primary.500`.toString() : 'transparent')};
    font-weight: ${(props) => (props.active ? 600 : 400)};
    &:hover {
        color: ${(props) => (props.active ? '#f0f6ff' : '#e7ecf3')};
    }
`;

const ActionBtns = styled.div`
    ${tw`flex items-center gap-2.5 ml-auto flex-wrap`};
`;

const VDivider = styled.span`
    width: 1px;
    height: 18px;
    background: ${theme`colors.neutral.600`.toString()};
    align-self: center;
`;

// 危险按钮（重置世界：透明底红边，对齐生产 ClearBtn/RemoveBtn 语汇）
// Button 是 inline-block，文字走 baseline 会垂直偏移 → 改 inline-flex 居中
const DangerBtn = styled(Button)`
    ${tw`text-[13px] px-4 bg-transparent border border-red-500 text-red-400 hover:bg-red-500/10`};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 34px;
`;

// 保存/还原按钮（与切换组等高 34px）
const PrimaryBtn = styled(Button)`
    ${tw`text-[13px] px-4 h-[34px]`};
    display: inline-flex;
    align-items: center;
    justify-content: center;
`;
const GreyBtn = styled(Button)`
    ${tw`text-[13px] px-4 h-[34px]`};
    display: inline-flex;
    align-items: center;
    justify-content: center;
`;

// ===== 分类容器：content-visibility 跳过屏外分类渲染（滚动性能） =====
// 注意：
// 1. content-visibility 不能走 twin 任意值写法（twin.macro 不识别，构建报错），用 styled 原生 CSS
// 2. content-visibility 含 paint containment，会把下拉菜单溢出卡片的部分裁剪掉——
//    因此当前分类有下拉打开时（skipRender=false）移除该属性，菜单正常溢出显示
const CatSection = styled.div<{ skipRender?: boolean }>`
    ${(props) => props.skipRender && `content-visibility: auto; contain-intrinsic-block-size: 600px;`}
`;

// ===== 分类标题 =====
const CatHead = styled.div`
    ${tw`flex items-center gap-2 mt-6 mb-3`};
`;

const CatTitle = styled.h2`
    ${tw`text-[15px] font-semibold text-neutral-100`};
`;

const CatCount = styled.span`
    ${tw`text-[11px] text-neutral-400 bg-neutral-700 border border-neutral-600 rounded-md px-2 py-0.5 leading-none`};
`;

// ===== 卡片网格：桌面 5 列 / 中屏 3 列 / 手机 1 列 =====
const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    @media (max-width: 700px) {
        grid-template-columns: 1fr;
    }
    @media (min-width: 1200px) {
        grid-template-columns: repeat(5, 1fr);
    }
`;

// 卡片：左右布局（图标 + 名称/下拉），dirty 时蓝边框 + 背景微蓝；contain 隔离重排影响
const Card = styled.div<{ dirty?: boolean }>`
    ${tw`flex items-center gap-2 rounded-xl border p-2.5 min-w-0 transition-colors duration-150`};
    background: ${theme`colors.neutral.700`.toString()};
    border-color: ${(props) =>
        props.dirty ? theme`colors.primary.500`.toString() : theme`colors.neutral.600`.toString()};
    background: ${(props) => (props.dirty ? '#3a476a' : theme`colors.neutral.700`.toString())};
    contain: layout style;
    &:hover {
        border-color: ${(props) => (props.dirty ? theme`colors.primary.400`.toString() : '#4a5a7a')};
    }
`;

const CardIcon = styled.img`
    width: 46px;
    height: 46px;
    background: #2b3650;
    object-fit: contain;
    flex-shrink: 0;
    content-visibility: auto;
`;

const CardMain = styled.div`
    ${tw`flex-1 min-w-0 flex flex-col gap-1`};
`;

const CardName = styled.div`
    ${tw`text-[13px] font-medium text-neutral-100 leading-snug`};
    overflow-wrap: anywhere;
`;

const CardKey = styled.div`
    ${tw`text-[10px] text-neutral-500 font-mono leading-none`};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

// ===== 自定义下拉（右侧独立，宽度随内容自适应；点击展开/再点收起） =====
const SelectWrap = styled.div`
    position: relative;
    flex: 0 0 auto;
    min-width: 64px;
    max-width: 110px;
`;

const SelectBtn = styled.button<{ open?: boolean }>`
    ${tw`w-full flex items-center justify-center rounded-lg border text-[13px] text-neutral-100 cursor-pointer px-1 transition-colors duration-150`};
    height: 40px;
    background: #1d243a;
    border-color: ${(props) => (props.open ? theme`colors.primary.500`.toString() : '#3d4a63')};
    text-align: center;
    user-select: none;
    font-family: inherit;
    &:hover {
        border-color: #4a5a7a;
    }
`;

const OptMenu = styled.div`
    position: absolute;
    top: 42px;
    left: 0;
    right: 0;
    background: #1d243a;
    border: 1px solid #3d4a63;
    border-radius: 8px;
    overflow: hidden;
    z-index: 40;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
`;

const OptItem = styled.button<{ active?: boolean }>`
    ${tw`w-full py-[7px] px-1 text-xs text-neutral-100 text-center cursor-pointer whitespace-nowrap border-0 transition-colors duration-100`};
    background: transparent;
    font-family: inherit;
    color: ${(props) => (props.active ? '#5a96f6' : '#e7ecf3')};
    font-weight: ${(props) => (props.active ? 600 : 400)};
    &:hover {
        background: #2b3650;
    }
`;

// ===== 确认弹窗（对齐生产 ConfirmMask/ConfirmBox） =====
const ConfirmMask = styled.div`
    ${tw`fixed inset-0 z-[60] flex items-center justify-center p-5`};
    background: rgba(10, 16, 28, 0.55);
`;

const ConfirmBox = styled.div`
    ${tw`w-[380px] max-w-full p-4 rounded-xl border`};
    background: ${theme`colors.neutral.800`.toString()};
    border-color: ${theme`colors.neutral.600`.toString()};
`;

const ConfirmTitle = styled.div`
    ${tw`text-[15px] font-bold text-neutral-100 mb-2 flex items-center gap-1.5`};
    color: hsl(0, 80%, 72%);
`;

const ConfirmText = styled.div`
    ${tw`text-[13px] text-neutral-400 leading-relaxed mb-4 break-all whitespace-pre-line`};
`;

const ConfirmActions = styled.div`
    ${tw`flex justify-end gap-2.5`};
`;

// 不支持提示
const Unsupported = styled.div`
    ${tw`mt-5 px-3 py-2 rounded-lg border text-xs leading-relaxed`};
    border-color: rgba(255, 170, 0, 0.35);
    background: rgba(255, 170, 0, 0.08);
    color: hsl(40, 90%, 72%);
`;

type Shard = 'master' | 'caves';

interface ConfirmState {
    title: string;
    text: string;
    onOk: () => void;
}

const visibleItems = (shard: Shard): WorldgenSetting[] =>
    WORLDGEN_SETTINGS.filter((it) => it.scope === 'both' || it.scope === shard);

// ===== 单个设置卡片（memo：仅 cur/dirty/open 等变化时重渲染；图标懒加载） =====
interface SettingCardProps {
    it: WorldgenSetting;
    cur: string;
    curZh: string;
    dirty: boolean;
    open: boolean;
    onToggle: (key: string) => void;
    onSelect: (key: string, v: string) => void;
}

const SettingCard = memo(({ it, cur, curZh, dirty, open, onToggle, onSelect }: SettingCardProps) => (
    <Card dirty={dirty}>
        <CardIcon src={it.icon} alt='' width={46} height={46} loading='lazy' decoding='async' />
        <CardMain>
            <CardName>{it.zh}</CardName>
            <CardKey>{it.key}</CardKey>
        </CardMain>
        <SelectWrap>
            <SelectBtn open={open} onClick={() => onToggle(it.key)}>
                <span>{curZh}</span>
            </SelectBtn>
            {open && (
                <OptMenu>
                    {it.opts.map((o) => (
                        <OptItem key={o.v} active={o.v === cur} onClick={() => onSelect(it.key, o.v)}>
                            {o.zh}
                        </OptItem>
                    ))}
                </OptMenu>
            )}
        </SelectWrap>
    </Card>
));

// ===== 加载骨架屏：按真实分类/项数渲染灰色块，加载完成无布局跳动 =====
const LoadingSkeleton = ({ vis }: { vis: WorldgenSetting[] }) => (
    <>
        {CAT_ORDER.map((cat) => {
            const items = vis.filter((it) => it.cat === cat);
            if (items.length === 0) return null;
            return (
                <div key={cat}>
                    <CatHead>
                        <div css={tw`h-4 w-20 rounded-md bg-neutral-700 animate-pulse`} />
                        <div css={tw`h-4 w-10 rounded-md bg-neutral-700 animate-pulse`} />
                    </CatHead>
                    <Grid>
                        {items.map((it) => (
                            <Card key={it.key} css={tw`pointer-events-none`}>
                                <div css={tw`w-[46px] h-[46px] bg-neutral-600 animate-pulse flex-shrink-0`} />
                                <CardMain>
                                    <div css={tw`h-3.5 w-20 rounded bg-neutral-600 animate-pulse`} />
                                    <div css={tw`h-2.5 w-14 rounded bg-neutral-600 animate-pulse`} />
                                </CardMain>
                                <div css={tw`h-10 w-16 rounded bg-neutral-600 animate-pulse`} />
                            </Card>
                        ))}
                    </Grid>
                </div>
            );
        })}
    </>
);

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data?.uuid);
    const variables = ServerContext.useStoreState((state) => state.server.data?.variables);
    const serverStatus = ServerContext.useStoreState((state) => state.status.value);
    const capable = hasWorldSettingsCapability(variables);

    // 提示条状态：默认 info（更多设置需按教程在客户端生成），保存/重置成功切 success 变绿，数秒后自动恢复
    const [hint, setHint] = useState<{ mode: 'info' | 'success' | 'error'; text: string }>({
        mode: 'info',
        text: '更多设置需按教程在客户端生成',
    });
    const hintTimer = useRef<number | null>(null);
    const flashHint = useCallback((mode: 'success' | 'error', text: string) => {
        if (hintTimer.current) window.clearTimeout(hintTimer.current);
        setHint({ mode, text });
        hintTimer.current = window.setTimeout(() => {
            setHint({ mode: 'info', text: '更多设置需按教程在客户端生成' });
        }, 4000);
    }, []);

    const [shard, setShard] = useState<Shard>('master');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [files, setFiles] = useState<{ master: string; caves: string }>({ master: '', caves: '' });
    const [fileVals, setFileVals] = useState<Record<string, Record<string, string>>>({});
    const [values, setValues] = useState<Record<string, Record<Shard, string>>>({});
    const [saving, setSaving] = useState(false);
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);

    // ===== 加载：读两个 lua，解析已知 key；文件缺失的用数据表默认兜底 =====
    const load = useCallback(() => {
        if (!uuid) return;
        setLoading(true);
        setError(null);
        getWorldgenFiles(uuid)
            .then((f) => {
                const fvMaster = parseKnown(f.master);
                const fvCaves = parseKnown(f.caves);
                setFiles(f);
                setFileVals({ master: fvMaster, caves: fvCaves });
                const init: Record<string, Record<Shard, string>> = {};
                for (const it of WORLDGEN_SETTINGS) {
                    init[it.key] = {
                        master: fvMaster[it.key] !== undefined ? fvMaster[it.key] : it.default_master,
                        caves: fvCaves[it.key] !== undefined ? fvCaves[it.key] : it.default_caves,
                    };
                }
                setValues(init);
            })
            .catch((e) => {
                console.error(e);
                setError(httpErrorToHuman(e));
            })
            .finally(() => setLoading(false));
    }, [uuid]);

    useEffect(() => {
        load();
    }, [load]);

    // ===== 当前 shard 可见项与统计 =====
    const vis = useMemo(() => visibleItems(shard), [shard]);

    const baseOf = useCallback(
        (it: WorldgenSetting): string =>
            fileVals[shard]?.[it.key] !== undefined ? fileVals[shard][it.key] : it[`default_${shard}` as const],
        [fileVals, shard]
    );

    const dirtyCount = useMemo(() => {
        let n = 0;
        for (const it of vis) {
            if (values[it.key] && values[it.key][shard] !== baseOf(it)) n++;
        }
        return n;
    }, [vis, values, shard, baseOf]);

    const isDirty = useCallback(
        (it: WorldgenSetting): boolean => !!values[it.key] && values[it.key][shard] !== baseOf(it),
        [values, shard, baseOf]
    );

    // 选项值 → 中文映射（一次性构建，卡片渲染 O(1) 查表，替代每卡 opts.find）
    const zhMap = useMemo(() => {
        const m: Record<string, Record<string, string>> = {};
        for (const it of WORLDGEN_SETTINGS) {
            const row: Record<string, string> = {};
            for (const o of it.opts) {
                row[o.v] = o.zh;
            }
            m[it.key] = row;
        }
        return m;
    }, []);

    // ===== 编辑（稳定引用：memo 卡片只传 key，避免闭包导致全量重渲染） =====
    const toggleOpen = useCallback((key: string) => {
        setOpenKey((cur) => (cur === key ? null : key));
    }, []);

    const selectValue = useCallback(
        (key: string, v: string) => {
            setValues((prev) => ({ ...prev, [key]: { ...prev[key], [shard]: v } }));
            setOpenKey(null);
        },
        [shard]
    );

    // ===== 保存：分别写回两个 shard（按归属过滤 key），整体覆盖 =====
    const save = async () => {
        if (saving || !uuid) return;
        setSaving(true);
        try {
            const masterOverrides: Record<string, string> = {};
            const cavesOverrides: Record<string, string> = {};
            for (const it of WORLDGEN_SETTINGS) {
                if (it.scope === 'master' || it.scope === 'both') {
                    masterOverrides[it.key] = values[it.key].master;
                }
                if (it.scope === 'caves' || it.scope === 'both') {
                    cavesOverrides[it.key] = values[it.key].caves;
                }
            }
            const nextMaster = applyOverrides(files.master, masterOverrides, 'SURVIVAL_TOGETHER');
            const nextCaves = applyOverrides(files.caves, cavesOverrides, 'DST_CAVE');
            await saveWorldgenFiles(uuid, { master: nextMaster, caves: nextCaves });
            setFiles({ master: nextMaster, caves: nextCaves });
            setFileVals({
                master: parseKnown(nextMaster),
                caves: parseKnown(nextCaves),
            });
            flashHint('success', '保存成功，重启服务器后生效。');
        } catch (e) {
            console.error(e);
            flashHint('error', httpErrorToHuman(e));
        } finally {
            setSaving(false);
        }
    };

    // ===== 全部还原（当前 shard 可见项还原到文件值/默认值） =====
    const resetAll = () => {
        const next = { ...values };
        for (const it of vis) {
            next[it.key] = { ...next[it.key], [shard]: baseOf(it) };
        }
        setValues(next);
    };

    // ===== 重置世界：先查服务器状态，已关闭才删四个目录 =====
    const doReset = async () => {
        if (!uuid) return;
        if (serverStatus !== 'offline') {
            flashHint('error', '无法重置：服务器运行中，请先关闭服务器。');
            return;
        }
        setSaving(true);
        try {
            await resetWorld(uuid);
            flashHint('success', '已重置世界，重启服务器后将重新生成世界。');
        } catch (e) {
            console.error(e);
            flashHint('error', httpErrorToHuman(e));
        } finally {
            setSaving(false);
        }
    };

    const confirmReset = () => {
        setConfirm({
            title: '警告：将删除存档重新生成世界',
            text: '推荐在游戏内重开，服主即可操作。',
            onOk: () => {
                setConfirm(null);
                doReset();
            },
        });
    };

    if (!capable) {
        return (
            <ServerContentBlock title={'世界设置'}>
                <Unsupported>当前服务器的 EGG 不支持世界设置（未侦测到 world-settings 能力）。</Unsupported>
            </ServerContentBlock>
        );
    }

    return (
        <ServerContentBlock title={'世界设置'} showFlashKey={'worldsettings'}>
            <div css={tw`flex items-start mb-4`}>
                <HeaderL>
                    <IconBlock>
                        <svg
                            width='20'
                            height='20'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        >
                            <circle cx='12' cy='12' r='9' />
                            <ellipse cx='12' cy='12' rx='4.5' ry='9' />
                            <path d='M3.2 12h17.6' />
                        </svg>
                    </IconBlock>
                    <h1 css={tw`text-[30px] font-bold leading-tight`}>世界设置</h1>
                </HeaderL>
                <HeaderR>
                    <StatsPill>
                        共 <b>{vis.length}</b> 项 · 已修改 <b>{dirtyCount}</b> 项
                    </StatsPill>
                    <RestartHint mode={hint.mode}>
                        <svg
                            width='12'
                            height='12'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        >
                            <path d='M13 2L3 14h9l-1 8 10-12h-9l1-8z' />
                        </svg>
                        <span>{hint.text}</span>
                    </RestartHint>
                </HeaderR>
            </div>

            <CtrlRow>
                <ModeBar>
                    <ModeBtn active={shard === 'master'} onClick={() => setShard('master')}>
                        地面 Master
                    </ModeBtn>
                    <ModeBtn active={shard === 'caves'} onClick={() => setShard('caves')}>
                        洞穴 Caves
                    </ModeBtn>
                </ModeBar>
                <ActionBtns>
                    <DangerBtn onClick={confirmReset} disabled={saving}>
                        重置世界
                    </DangerBtn>
                    <VDivider />
                    <PrimaryBtn color={'primary'} onClick={save} disabled={saving || dirtyCount === 0}>
                        {saving ? '保存中…' : '保存修改'}
                    </PrimaryBtn>
                    <GreyBtn color={'grey'} isSecondary onClick={resetAll} disabled={saving}>
                        全部还原
                    </GreyBtn>
                </ActionBtns>
            </CtrlRow>

            {loading ? (
                <LoadingSkeleton vis={vis} />
            ) : error ? (
                <div css={tw`mt-8 text-sm text-red-400`}>加载失败：{error}</div>
            ) : (
                CAT_ORDER.map((cat) => {
                    const items = vis.filter((it) => it.cat === cat);
                    if (items.length === 0) return null;
                    // 当前分类有下拉打开时移除 content-visibility（避免 paint containment 裁剪菜单）
                    const catOpen = items.some((it) => it.key === openKey);
                    return (
                        <CatSection key={cat} skipRender={!catOpen}>
                            <CatHead>
                                <CatTitle>{CAT_ZH[cat]}</CatTitle>
                                <CatCount>{items.length} 项</CatCount>
                            </CatHead>
                            <Grid>
                                {items.map((it) => {
                                    const cur = values[it.key] ? values[it.key][shard] : baseOf(it);
                                    const curZh = (zhMap[it.key] && zhMap[it.key][cur]) || cur;
                                    return (
                                        <SettingCard
                                            key={it.key}
                                            it={it}
                                            cur={cur}
                                            curZh={curZh}
                                            dirty={isDirty(it)}
                                            open={openKey === it.key}
                                            onToggle={toggleOpen}
                                            onSelect={selectValue}
                                        />
                                    );
                                })}
                            </Grid>
                        </CatSection>
                    );
                })
            )}

            {/* 确认弹窗（重置世界） */}
            {confirm && (
                <ConfirmMask
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget) setConfirm(null);
                    }}
                >
                    <ConfirmBox role='dialog' aria-modal='true'>
                        <ConfirmTitle>
                            <svg
                                width='15'
                                height='15'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2'
                                strokeLinecap='round'
                                strokeLinejoin='round'
                            >
                                <path d='M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z' />
                                <line x1='12' y1='9' x2='12' y2='13' />
                                <line x1='12' y1='17' x2='12.01' y2='17' />
                            </svg>
                            {confirm.title}
                        </ConfirmTitle>
                        <ConfirmText>{confirm.text}</ConfirmText>
                        <ConfirmActions>
                            <Button size={'small'} color={'grey'} isSecondary onClick={() => setConfirm(null)}>
                                取消
                            </Button>
                            <Button size={'small'} color={'primary'} onClick={confirm.onOk}>
                                确认重置
                            </Button>
                        </ConfirmActions>
                    </ConfirmBox>
                </ConfirmMask>
            )}
        </ServerContentBlock>
    );
};
