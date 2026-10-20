import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components/macro';
import tw, { theme } from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Button from '@/components/elements/Button';
import { ServerContext } from '@/state/server';
import { SocketEvent } from '@/components/server/events';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import http from '@/api/http';

// ===== 样式（对齐 worldsettings 生产风格：深蓝主题） =====

const HeaderL = styled.div`
    ${tw`flex items-center gap-3`};
`;

const IconBlock = styled.div`
    ${tw`w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center text-primary-50 flex-shrink-0`};
`;

const HeaderR = styled.div`
    ${tw`ml-auto flex flex-col items-end gap-1.5 flex-wrap`};
`;

const HeaderPills = styled.div`
    ${tw`flex items-center gap-2 flex-wrap justify-end`};
`;

// 在线人数胶囊
const StatsPill = styled.div`
    ${tw`inline-flex items-center gap-1.5 rounded-full border border-neutral-600 px-3.5 text-xs text-neutral-400`};
    background: ${theme`colors.neutral.700`.toString()};
    line-height: 26px;
    & > b {
        ${tw`text-neutral-100 font-semibold`};
    }
`;

// 服务器状态胶囊（dot + 文字）
const StatusPill = styled.div<{ mode: 'running' | 'offline' | 'transition' }>`
    ${tw`inline-flex items-center gap-1.5 rounded-full border border-neutral-600 px-3.5 text-xs text-neutral-400`};
    background: ${theme`colors.neutral.700`.toString()};
    line-height: 26px;
    & > i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: ${(props) =>
            props.mode === 'running'
                ? '#34d399'
                : props.mode === 'offline'
                ? '#f87171'
                : 'hsl(40, 90%, 72%)'};
        ${(props) =>
            props.mode === 'running'
                ? 'box-shadow: 0 0 6px rgba(52, 211, 153, 0.7);'
                : props.mode === 'offline'
                ? 'box-shadow: 0 0 6px rgba(248, 113, 113, 0.7);'
                : ''}
    }
`;

// 提示条（info/success/error 三色，对齐生产）
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

// 区块标题
const SectionHead = styled.div`
    ${tw`flex items-center gap-2 mt-6 mb-3`};
`;

const SectionTitle = styled.h2`
    ${tw`text-[15px] font-semibold text-neutral-100`};
`;

// 卡片网格：桌面一行 3 个 / 手机一行 1 个（与 demo 对齐）
const Grid = styled.div<{ cols?: number }>`
    display: grid;
    grid-template-columns: ${({ cols }) => (cols === 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)')};
    gap: 14px;
    margin-top: 14px; /* 卡片后紧跟网格时加间距，避免贴在一起 */
    @media (max-width: 700px) {
        grid-template-columns: 1fr;
    }
`;

// 卡片：竖排（标题 + 描述 + 控制区）
const Card = styled.div`
    ${tw`flex flex-col gap-2 rounded-xl border border-neutral-600 p-3 min-w-0 transition-colors duration-150`};
    background: ${theme`colors.neutral.700`.toString()};
    &:hover {
        border-color: #4a5a7a;
    }
`;

const CardTitle = styled.div`
    ${tw`text-[13px] font-medium text-neutral-100 leading-snug`};
`;

const CardDesc = styled.div`
    ${tw`text-[10px] text-neutral-500 leading-none`};
`;

const CardBody = styled.div`
    ${tw`mt-auto flex items-center gap-2 flex-wrap`};
`;

// 玩家列表分区错峰浮现（百叶式逐块滑入）
const mcFadeSlide = keyframes`
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
`;

// 玩家列表分区（在线 / 黑名单 / 白名单）
const PlayerGroup = styled.div<{ delay?: number }>`
    ${tw`flex items-center gap-2 flex-wrap`};
    animation: ${mcFadeSlide} 0.28s ease-out both;
    animation-delay: ${(props) => (props.delay || 0) + 'ms'};
`;

const GroupLabel = styled.span<{ dot: 'on' | 'off' | 'wl' }>`
    ${tw`inline-flex items-center gap-1.5 text-[11px] text-neutral-400 whitespace-nowrap`};
    & > i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: ${(props) =>
            props.dot === 'on' ? '#34d399' : props.dot === 'wl' ? '#7db4ff' : '#5a6b8a'};
    }
`;

// 分段按钮组：按钮平分容器宽度，任意宽度不溢出（与 demo 对齐）
const ModeBar = styled.div`
    ${tw`flex items-stretch gap-0.5 rounded-lg border border-neutral-600 p-0.5 h-[34px] w-full max-w-full`};
    background: ${theme`colors.neutral.700`.toString()};
`;

const ModeBtn = styled.button<{ active?: boolean }>`
    ${tw`h-full rounded-md text-[13px] cursor-pointer border-0 transition-colors duration-150 px-1.5`};
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: inherit;
    color: ${(props) => (props.active ? '#f0f6ff' : '#aeb8cb')};
    background: ${(props) => (props.active ? theme`colors.primary.500`.toString() : 'transparent')};
    font-weight: ${(props) => (props.active ? 600 : 400)};
    &:hover {
        color: ${(props) => (props.active ? '#f0f6ff' : '#e7ecf3')};
    }
    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }
`;

// 自定义下拉（对齐生产 SelectWrap/SelectBtn/OptMenu/OptItem）
const SelectWrap = styled.div`
    position: relative;
    flex: 0 0 auto;
    min-width: 96px;
`;

const SelectBtn = styled.button<{ open?: boolean; disabled?: boolean }>`
    ${tw`w-full flex items-center justify-center rounded-lg border text-[13px] text-neutral-100 cursor-pointer px-2 transition-colors duration-150`};
    height: 34px;
    background: #1d243a;
    border-color: ${(props) => (props.open ? theme`colors.primary.500`.toString() : '#3d4a63')};
    text-align: center;
    user-select: none;
    font-family: inherit;
    &:hover {
        border-color: ${(props) => (props.disabled ? '#3d4a63' : '#4a5a7a')};
    }
    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }
`;

const OptMenu = styled.div`
    position: absolute;
    top: 40px;
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
    ${tw`w-full py-[7px] px-2 text-xs text-left cursor-pointer whitespace-nowrap border-0 transition-colors duration-100`};
    background: transparent;
    font-family: inherit;
    color: ${(props) => (props.active ? '#5a96f6' : '#e7ecf3')};
    font-weight: ${(props) => (props.active ? 600 : 400)};
    &:hover {
        background: #2b3650;
    }
`;

// 下拉项 / 玩家 chip 的状态标签
const Tag = styled.span<{ kind: 'op' | 'ban' | 'wl' }>`
    font-size: 9px;
    padding: 0 5px;
    line-height: 14px;
    border-radius: 4px;
    margin-left: 4px;
    ${(props) =>
        props.kind === 'op'
            ? 'color:#fbbf24;border:1px solid rgba(251,191,36,0.5);background:rgba(251,191,36,0.08);'
            : props.kind === 'ban'
            ? 'color:hsl(0,80%,72%);border:1px solid rgba(239,68,68,0.5);background:rgba(239,68,68,0.08);'
            : 'color:#7db4ff;border:1px solid rgba(90,150,246,0.5);background:rgba(90,150,246,0.08);'}
`;

// 操作按钮（对齐生产 PrimaryBtn/GreyBtn/DangerBtn）
const ActionBtn = styled(Button)`
    ${tw`text-[13px] px-3.5 h-[34px]`};
    display: inline-flex;
    align-items: center;
    justify-content: center;
`;

const DangerBtn = styled(Button)`
    ${tw`text-[13px] px-3.5 bg-transparent border border-red-500 text-red-400 hover:bg-red-500/10`};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 34px;
`;

// 输入框（广播）
const TextInput = styled.input`
    ${tw`flex-1 min-w-0 rounded-lg border border-neutral-600 bg-[#1d243a] text-[16px] text-neutral-100 px-3 h-[34px] outline-none transition-colors duration-150`};
    font-family: inherit;
    &:focus {
        border-color: ${theme`colors.primary.500`.toString()};
    }
    &::placeholder {
        color: #5a6b8a;
    }
    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }
`;

// 玩家 chip
const PlayerChip = styled.span`
    ${tw`inline-flex items-center gap-1 rounded-full border border-neutral-600 bg-[#1d243a] px-2.5 text-xs text-neutral-100`};
    line-height: 24px;
`;

// 确认弹窗（对齐生产 ConfirmMask/ConfirmBox）
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
    ${tw`text-[15px] font-bold mb-2 flex items-center gap-1.5`};
    color: hsl(0, 80%, 72%);
`;

const ConfirmText = styled.div`
    ${tw`text-[13px] text-neutral-400 leading-relaxed mb-4 break-all whitespace-pre-line`};
`;

const ConfirmActions = styled.div`
    ${tw`flex justify-end gap-2.5`};
`;

// ===== 数据 =====
const TIME_OPTS = [
    { v: 'day', zh: '白天' },
    { v: 'noon', zh: '正午' },
    { v: 'night', zh: '夜晚' },
    { v: 'midnight', zh: '午夜' },
];

const WEATHER_OPTS = [
    { v: 'clear', zh: '晴朗' },
    { v: 'rain', zh: '下雨' },
    { v: 'thunder', zh: '雷暴' },
];

const GAMEMODES = [
    { v: 'survival', zh: '生存' },
    { v: 'creative', zh: '创造' },
    { v: 'adventure', zh: '冒险' },
    { v: 'spectator', zh: '旁观' },
];

interface OnlineState {
    count: number;
    max: number;
    players: string[];
}

interface ConfirmState {
    title: string;
    text: string;
    onOk: () => void;
}

// ===== 通用下拉（玩家/模式，支持状态标签） =====
const PlayerSelect = ({
    options,
    value,
    open,
    placeholder,
    disabled,
    onToggle,
    onSelect,
    renderTag,
}: {
    options: string[];
    value: string;
    open: boolean;
    placeholder: string;
    disabled?: boolean;
    onToggle: () => void;
    onSelect: (v: string) => void;
    renderTag?: (v: string) => React.ReactNode;
}) => (
    <SelectWrap className='mc-select'>
        <SelectBtn open={open} disabled={disabled} onClick={onToggle}>
            <span>{value || placeholder}</span>
        </SelectBtn>
        {open && (
            <OptMenu>
                {options.length === 0 ? (
                    <OptItem onClick={onToggle}>{'暂无在线玩家'}</OptItem>
                ) : (
                    options.map((p) => (
                        <OptItem key={p} active={p === value} onClick={() => onSelect(p)}>
                            {p}
                            {renderTag ? renderTag(p) : null}
                        </OptItem>
                    ))
                )}
            </OptMenu>
        )}
    </SelectWrap>
);

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data?.uuid);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const connected = ServerContext.useStoreState((state) => state.socket.connected);
    const serverStatus = ServerContext.useStoreState((state) => state.status.value);

    const isRunning = serverStatus === 'running';
    const disabled = !isRunning;

    const [online, setOnline] = useState<OnlineState | null>(null);
    const [listLoading, setListLoading] = useState(false);
    const [openSel, setOpenSel] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);
    const [broadcast, setBroadcast] = useState('');

    const [opPlayer, setOpPlayer] = useState('');
    const [banPlayer, setBanPlayer] = useState('');
    const [wlPlayer, setWlPlayer] = useState('');
    const [tpFrom, setTpFrom] = useState('');
    const [tpTo, setTpTo] = useState('');
    const [gmPlayer, setGmPlayer] = useState('');
    const [gmMode, setGmMode] = useState('');

    // 服务器侧状态回显：OP（ops.json）/ 白名单（/whitelist list）/ 封禁（/banlist players）/ keepInventory
    const [ops, setOps] = useState<string[]>([]);
    const [whitelist, setWhitelist] = useState<string[]>([]);
    const [banned, setBanned] = useState<string[]>([]);
    const [keepInv, setKeepInv] = useState<boolean | null>(null);

    const [hint, setHint] = useState<{ mode: 'success' | 'error'; text: string } | null>(null);
    const hintTimer = useRef<number | null>(null);
    const flashHint = useCallback((mode: 'success' | 'error', text: string) => {
        if (hintTimer.current) window.clearTimeout(hintTimer.current);
        setHint({ mode, text });
        hintTimer.current = window.setTimeout(() => setHint(null), 3000);
    }, []);

    const players = useMemo(() => online?.players || [], [online]);

    // ===== 命令发送 =====
    const sendCommand = useCallback(
        (cmd: string, okText?: string) => {
            if (!instance || !connected) {
                flashHint('error', '控制台未连接，请稍后重试。');
                return;
            }
            if (!isRunning) return; // 服务器未运行时禁止执行
            instance.send('send command', cmd);
            if (okText) flashHint('success', `已发送：${okText}`);
        },
        [instance, connected, flashHint, isRunning]
    );

    // ===== 读取 ops.json（原版无查询 OP 指令，文件是唯一权威来源） =====
    const loadOps = useCallback(async () => {
        if (!uuid) return;
        try {
            const { data } = await http.get(`/api/client/servers/${uuid}/files/contents`, {
                params: { file: 'ops.json' },
                transformResponse: (res) => res,
                responseType: 'text',
                headers: { 'X-Doubao-Skip-Progress': '1' },
            });
            const parsed = JSON.parse(data || '[]');
            setOps(Array.isArray(parsed) ? parsed.map((x) => x.name).filter(Boolean) : []);
        } catch {
            setOps([]);
        }
    }, [uuid]);

    // ===== 查询三类状态（无副作用命令） =====
    const refreshStatuses = useCallback(() => {
        if (!isRunning) return;
        sendCommand('whitelist list');
        sendCommand('banlist players');
        sendCommand('gamerule keepInventory');
        loadOps();
    }, [isRunning, sendCommand, loadOps]);

    // ===== 在线玩家：发 list 并解析输出（服务器未运行时不发请求） =====
    const refreshList = useCallback(() => {
        if (!uuid || !connected || !isRunning) return;
        setListLoading(true);
        sendCommand('list');
        window.setTimeout(() => setListLoading(false), 8000);
    }, [uuid, connected, sendCommand, isRunning]);

    // 服务器启动 → 自动拉列表 + 状态；停止 → 清空状态
    useEffect(() => {
        if (isRunning) {
            refreshList();
            refreshStatuses();
        } else {
            setOnline(null);
            setOps([]);
            setWhitelist([]);
            setBanned([]);
            setKeepInv(null);
            setOpenSel(null);
        }
    }, [isRunning, refreshList, refreshStatuses]);

    // ===== 解析控制台输出（list / whitelist / banlist / gamerule） =====
    useWebsocketEvent(SocketEvent.CONSOLE_OUTPUT, (data) => {
        const line = String(data).replace(/(?:\r\n|\r|\n)$/im, '').trim();
        if (!line) return;

        // 在线玩家（兼容多版本）：
        //   "There are 3 of a max of 20 players online: A, B, C"  (1.18+)
        //   "There are 3 players online: A, B, C"                 (旧版)
        //   无玩家时无冒号： "There are 0 of a max of 20 players online"
        const m =
            line.match(/(\d+)\s+of\s+a\s+max\s+of\s+(\d+)\s+players?\s+online:\s*(.*)$/i) ||
            line.match(/(\d+)\s+players?\s+online:\s*(.*)$/i) ||
            line.match(/(\d+)\s+of\s+a\s+max\s+of\s+(\d+)\s+players?\s+online$/i);
        if (m) {
            const count = Number(m[1]);
            const max = m[2] ? Number(m[2]) : count;
            const list = m[3] ? m[3].split(',').map((s) => s.trim()).filter(Boolean) : [];
            setOnline({ count, max, players: list });
            setListLoading(false);
            return;
        }

        // 白名单： "There are 4 whitelisted players: Steve, Alex" / "There are no whitelisted players"
        const wm = line.match(/There are (no|\d+) whitelisted players?:?\s*(.*)$/i);
        if (wm) {
            setWhitelist(wm[1] === 'no' ? [] : wm[2] ? wm[2].split(',').map((s) => s.trim()).filter(Boolean) : []);
            return;
        }

        // 封禁： "There are 1 banned players: Herobrine" / "There are no banned players"
        const bm = line.match(/There are (no|\d+) banned players?:?\s*(.*)$/i);
        if (bm) {
            setBanned(bm[1] === 'no' ? [] : bm[2] ? bm[2].split(',').map((s) => s.trim()).filter(Boolean) : []);
            return;
        }

        // keepInventory 当前值： "Gamerule keepInventory is now set to: false"
        const gm = line.match(/keepInventory is (?:now )?set to:?\s*(true|false)/i);
        if (gm) {
            setKeepInv(gm[1] === 'true');
        }
    });

    // 下拉外部点击收起
    useEffect(() => {
        if (!openSel) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Element | null;
            if (!t || !t.closest('.mc-select')) setOpenSel(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [openSel]);

    const toggleSel = useCallback((key: string) => setOpenSel((cur) => (cur === key ? null : key)), []);
    const pick = useCallback((key: string, v: string) => {
        setOpenSel(null);
        switch (key) {
            case 'op':
                return setOpPlayer(v);
            case 'ban':
                return setBanPlayer(v);
            case 'wl':
                return setWlPlayer(v);
            case 'tpFrom':
                return setTpFrom(v);
            case 'tpTo':
                return setTpTo(v);
            case 'gmPlayer':
                return setGmPlayer(v);
            case 'gmMode':
                return setGmMode(v);
        }
    }, []);

    // 玩家状态标签（下拉项用）
    const renderTag = useCallback(
        (p: string) => (
            <>
                {ops.includes(p) && <Tag kind='op'>OP</Tag>}
                {banned.includes(p) && <Tag kind='ban'>已封禁</Tag>}
                {whitelist.includes(p) && <Tag kind='wl'>白名单</Tag>}
            </>
        ),
        [ops, banned, whitelist]
    );

    // ===== 动作 =====
    const setTime = (v: string) => sendCommand(`time set ${v}`, `时间已设为${TIME_OPTS.find((o) => o.v === v)?.zh}`);
    const setWeather = (v: string) =>
        sendCommand(`weather ${v}`, `天气已设为${WEATHER_OPTS.find((o) => o.v === v)?.zh}`);

    const setKeepInvCb = (on: boolean) => {
        sendCommand(`gamerule keepInventory ${on ? 'true' : 'false'}`, on ? '死亡掉落已关闭' : '死亡掉落已开启');
        window.setTimeout(() => sendCommand('gamerule keepInventory'), 1200); // 操作后回查当前值
    };

    const doOp = (deop: boolean) => {
        if (!opPlayer) {
            flashHint('error', '请先选择玩家。');
            return;
        }
        sendCommand(`${deop ? 'deop' : 'op'} ${opPlayer}`, `${deop ? '解除OP' : '授予OP'}：${opPlayer}`);
        window.setTimeout(loadOps, 1200); // ops.json 由服务端异步落盘，稍后重读
    };

    const doBan = (pardon: boolean) => {
        if (!banPlayer) {
            flashHint('error', '请先选择玩家。');
            return;
        }
        sendCommand(`${pardon ? 'pardon' : 'ban'} ${banPlayer}`, `${pardon ? '解封' : '封禁'}：${banPlayer}`);
        window.setTimeout(() => sendCommand('banlist players'), 1200);
    };

    const doWhitelist = (remove: boolean) => {
        if (!wlPlayer) {
            flashHint('error', '请先选择玩家。');
            return;
        }
        sendCommand(`whitelist ${remove ? 'remove' : 'add'} ${wlPlayer}`, `${remove ? '移除白名单' : '添加白名单'}：${wlPlayer}`);
        window.setTimeout(() => sendCommand('whitelist list'), 1200);
    };

    const doTp = () => {
        if (!tpFrom || !tpTo) {
            flashHint('error', '请选择两个玩家。');
            return;
        }
        sendCommand(`tp ${tpFrom} ${tpTo}`, `传送 ${tpFrom} → ${tpTo}`);
    };

    const doGamemode = () => {
        if (!gmPlayer || !gmMode) {
            flashHint('error', '请选择玩家和模式。');
            return;
        }
        sendCommand(`gamemode ${gmMode} ${gmPlayer}`, `${gmPlayer} 已切换为${GAMEMODES.find((m) => m.v === gmMode)?.zh}`);
    };

    const doBroadcast = () => {
        const msg = broadcast.trim();
        if (!msg) {
            flashHint('error', '请输入广播内容。');
            return;
        }
        sendCommand(`say ${msg}`, `广播已发送：${msg}`);
        setBroadcast('');
    };

    const confirmReset = () => {
        setConfirm({
            title: '警告：将删除存档重新生成世界',
            text:
                serverStatus === 'offline'
                    ? '确认后将从服务器删除 world 数据，重启服务器后重新生成全新世界。此操作不可恢复，请先确认已备份。'
                    : '服务器正在运行，无法直接重置。请先关闭服务器后再执行重置。',
            onOk: () => {
                setConfirm(null);
                if (serverStatus === 'offline') {
                    flashHint('success', '已发送重置世界指令（Demo：文件操作待接后端）。');
                } else {
                    flashHint('error', '服务器运行中，请先关闭服务器。');
                }
            },
        });
    };

    // 常驻状态提示（无 flash 反馈时显示）
    const displayedHint = hint || (isRunning
        ? { mode: 'success' as const, text: '服务器运行中，全部功能可用' }
        : { mode: 'info' as const, text: '服务器未启动：仅重置世界可用' });

    const statusMode = isRunning ? 'running' : serverStatus === 'offline' ? 'offline' : 'transition';
    const statusText = isRunning ? '服务器已启动' : serverStatus === 'offline' ? '服务器未启动' : '状态变更中';

    return (
        <ServerContentBlock title={'快捷指令'} showFlashKey={'mcmanager'}>
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
                            <rect x='3' y='3' width='7' height='7' rx='1' />
                            <rect x='14' y='3' width='7' height='7' rx='1' />
                            <rect x='3' y='14' width='7' height='7' rx='1' />
                            <rect x='14' y='14' width='7' height='7' rx='1' />
                        </svg>
                    </IconBlock>
                    <h1 css={tw`text-[30px] font-bold leading-tight`}>快捷指令</h1>
                </HeaderL>
                <HeaderR>
                    <HeaderPills>
                        <StatsPill>
                            在线 <b>{online ? `${online.count}/${online.max}` : '--'}</b>
                        </StatsPill>
                        <StatusPill mode={statusMode}>
                            <i />
                            <span>{statusText}</span>
                        </StatusPill>
                    </HeaderPills>
                    <RestartHint mode={displayedHint.mode}>
                        <span>{displayedHint.text}</span>
                    </RestartHint>
                </HeaderR>
            </div>

            {/* 玩家管理（玩家列表 + 操作，一个区域） */}
            <SectionHead>
                <SectionTitle>玩家管理</SectionTitle>
            </SectionHead>
            <Card>
                <CardTitle>玩家列表</CardTitle>
                <CardDesc>在线 /list · 黑名单 /banlist players · 白名单 /whitelist list（金色 OP 标记）</CardDesc>
                <PlayerGroup delay={0}>
                    <GroupLabel dot='on'>
                        <i />在线
                    </GroupLabel>
                    {online && players.length > 0 ? (
                        players.map((p) => (
                            <PlayerChip key={p}>
                                {p}
                                {ops.includes(p) && <Tag kind='op'>OP</Tag>}
                            </PlayerChip>
                        ))
                    ) : listLoading ? (
                        <span css={tw`text-xs text-neutral-500`}>获取中…</span>
                    ) : (
                        <span css={tw`text-xs text-neutral-500`}>
                            {isRunning ? '暂无玩家在线' : '服务器未启动，暂无在线玩家'}
                        </span>
                    )}
                    <ActionBtn color={'grey'} isSecondary size={'small'} onClick={refreshList} disabled={disabled || listLoading}>
                        {listLoading ? '刷新中…' : '刷新'}
                    </ActionBtn>
                </PlayerGroup>
                {banned.length > 0 && (
                    <PlayerGroup delay={120}>
                        <GroupLabel dot='off'>
                            <i />黑名单
                        </GroupLabel>
                        {banned.map((p) => (
                            <PlayerChip key={p}>
                                {p}
                                <Tag kind='ban'>黑名单</Tag>
                            </PlayerChip>
                        ))}
                    </PlayerGroup>
                )}
                {whitelist.length > 0 && (
                    <PlayerGroup delay={240}>
                        <GroupLabel dot='wl'>
                            <i />白名单
                        </GroupLabel>
                        {whitelist.map((p) => (
                            <PlayerChip key={p}>
                                {p}
                                <Tag kind='wl'>白名单</Tag>
                            </PlayerChip>
                        ))}
                    </PlayerGroup>
                )}
            </Card>


                <Card>
                    <CardTitle>管理权限</CardTitle>
                    <CardDesc>当前 OP：{ops.length > 0 ? ops.join('、') : '—'}</CardDesc>
                    <CardBody>
                        <PlayerSelect
                            options={players}
                            value={opPlayer}
                            open={openSel === 'op'}
                            placeholder={'选择玩家'}
                            disabled={disabled}
                            onToggle={() => toggleSel('op')}
                            onSelect={(v) => pick('op', v)}
                            renderTag={renderTag}
                        />
                        <ActionBtn color={'primary'} size={'small'} onClick={() => doOp(false)} disabled={disabled}>
                            授予OP
                        </ActionBtn>
                        <ActionBtn color={'grey'} isSecondary size={'small'} onClick={() => doOp(true)} disabled={disabled}>
                            解除OP
                        </ActionBtn>
                    </CardBody>
                </Card>
                <Card>
                    <CardTitle>游戏模式</CardTitle>
                    <CardDesc>/gamemode</CardDesc>
                    <CardBody>
                        <PlayerSelect
                            options={players}
                            value={gmPlayer}
                            open={openSel === 'gmPlayer'}
                            placeholder={'选择玩家'}
                            disabled={disabled}
                            onToggle={() => toggleSel('gmPlayer')}
                            onSelect={(v) => pick('gmPlayer', v)}
                            renderTag={renderTag}
                        />
                        <PlayerSelect
                            options={GAMEMODES.map((m) => m.v)}
                            value={gmMode}
                            open={openSel === 'gmMode'}
                            placeholder={'模式'}
                            disabled={disabled}
                            onToggle={() => toggleSel('gmMode')}
                            onSelect={(v) => pick('gmMode', v)}
                        />
                        <ActionBtn color={'primary'} size={'small'} onClick={doGamemode} disabled={disabled}>
                            应用
                        </ActionBtn>
                    </CardBody>
                </Card>

                <Card>
                    <CardTitle>传送玩家</CardTitle>
                    <CardDesc>/tp 玩家A 玩家B</CardDesc>
                    <CardBody>
                        <PlayerSelect
                            options={players}
                            value={tpFrom}
                            open={openSel === 'tpFrom'}
                            placeholder={'玩家A'}
                            disabled={disabled}
                            onToggle={() => toggleSel('tpFrom')}
                            onSelect={(v) => pick('tpFrom', v)}
                            renderTag={renderTag}
                        />
                        <PlayerSelect
                            options={players}
                            value={tpTo}
                            open={openSel === 'tpTo'}
                            placeholder={'玩家B'}
                            disabled={disabled}
                            onToggle={() => toggleSel('tpTo')}
                            onSelect={(v) => pick('tpTo', v)}
                            renderTag={renderTag}
                        />
                        <ActionBtn color={'primary'} size={'small'} onClick={doTp} disabled={disabled}>
                            传送
                        </ActionBtn>
                    </CardBody>
                </Card>
                <Card>
                    <CardTitle>封禁</CardTitle>
                    <CardDesc>/ban /pardon</CardDesc>
                    <CardBody>
                        <PlayerSelect
                            options={players}
                            value={banPlayer}
                            open={openSel === 'ban'}
                            placeholder={'选择玩家'}
                            disabled={disabled}
                            onToggle={() => toggleSel('ban')}
                            onSelect={(v) => pick('ban', v)}
                            renderTag={renderTag}
                        />
                        <ActionBtn color={'primary'} size={'small'} onClick={() => doBan(false)} disabled={disabled}>
                            封禁
                        </ActionBtn>
                        <ActionBtn color={'grey'} isSecondary size={'small'} onClick={() => doBan(true)} disabled={disabled}>
                            解封
                        </ActionBtn>
                    </CardBody>
                </Card>
                <Card>
                    <CardTitle>白名单</CardTitle>
                    <CardDesc>/whitelist add / remove</CardDesc>
                    <CardBody>
                        <PlayerSelect
                            options={players}
                            value={wlPlayer}
                            open={openSel === 'wl'}
                            placeholder={'选择玩家'}
                            disabled={disabled}
                            onToggle={() => toggleSel('wl')}
                            onSelect={(v) => pick('wl', v)}
                            renderTag={renderTag}
                        />
                        <ActionBtn color={'primary'} size={'small'} onClick={() => doWhitelist(false)} disabled={disabled}>
                            添加
                        </ActionBtn>
                        <ActionBtn color={'grey'} isSecondary size={'small'} onClick={() => doWhitelist(true)} disabled={disabled}>
                            移除
                        </ActionBtn>
                    </CardBody>
                </Card>            </Grid>

            {/* 世界操作（广播长条 + 设置卡） */}
            <SectionHead>
                <SectionTitle>世界操作</SectionTitle>
            </SectionHead>
            <Card>
                <CardTitle>发送广播</CardTitle>
                <CardDesc>/say — 全服公告（兼容 Fabric/Forge/NeoForge/Paper）</CardDesc>
                <CardBody>
                    <TextInput
                        value={broadcast}
                        placeholder={'输入广播内容…'}
                        disabled={disabled}
                        onChange={(e) => setBroadcast(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') doBroadcast();
                        }}
                    />
                    <ActionBtn color={'primary'} size={'small'} onClick={doBroadcast} disabled={disabled}>
                        发送广播
                    </ActionBtn>
                </CardBody>
            </Card>
            <Grid cols={2}>
                <Card>
                    <CardTitle>世界时间</CardTitle>
                    <CardDesc>/time set</CardDesc>
                    <CardBody>
                        <ModeBar>
                            {TIME_OPTS.map((o) => (
                                <ModeBtn key={o.v} onClick={() => setTime(o.v)} disabled={disabled}>
                                    {o.zh}
                                </ModeBtn>
                            ))}
                        </ModeBar>
                    </CardBody>
                </Card>
                <Card>
                    <CardTitle>天气</CardTitle>
                    <CardDesc>/weather</CardDesc>
                    <CardBody>
                        <ModeBar>
                            {WEATHER_OPTS.map((o) => (
                                <ModeBtn key={o.v} onClick={() => setWeather(o.v)} disabled={disabled}>
                                    {o.zh}
                                </ModeBtn>
                            ))}
                        </ModeBar>
                    </CardBody>
                </Card>
                <Card>
                    <CardTitle>死亡掉落</CardTitle>
                    <CardDesc>/gamerule keepInventory（查询当前值）</CardDesc>
                    <CardBody>
                        <ModeBar>
                            <ModeBtn active={keepInv === false} onClick={() => setKeepInvCb(false)} disabled={disabled}>
                                掉落
                            </ModeBtn>
                            <ModeBtn active={keepInv === true} onClick={() => setKeepInvCb(true)} disabled={disabled}>
                                不掉落
                            </ModeBtn>
                        </ModeBar>
                    </CardBody>
                </Card>
                <Card>
                    <CardTitle>重新生成世界</CardTitle>
                    <CardDesc>删除存档，重启后生成全新世界</CardDesc>
                    <CardBody>
                        <DangerBtn size={'small'} onClick={confirmReset}>
                            重置世界
                        </DangerBtn>
                    </CardBody>
                </Card>
            </Grid>


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
                                确认
                            </Button>
                        </ConfirmActions>
                    </ConfirmBox>
                </ConfirmMask>
            )}
        </ServerContentBlock>
    );
};
