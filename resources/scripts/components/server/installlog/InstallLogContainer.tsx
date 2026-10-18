import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components/macro';
import tw from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Spinner from '@/components/elements/Spinner';
import { ServerContext } from '@/state/server';
import loadDirectory from '@/api/server/files/loadDirectory';
import getFileContents from '@/api/server/files/getFileContents';
import { httpErrorToHuman } from '@/api/http';

// ============================================================
// 日志着色（逐行前缀匹配）：脚本写入日志时剥掉了 ANSI 颜色码，
// 但颜色与行前缀绑定——按前缀反推颜色，前端逐行渲染
// 顺序：先转义 HTML 特殊字符（防注入），再按前缀整行上色
// ============================================================
const escapeHtml = (s: string): string =>
    s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

// 逐行前缀 → 颜色。前缀在三个脚本间不完全一致：
// INFO 统一 [INFO]；WARN 在 DST 为 [WARN]、MC/帕鲁为 [WARNING]；分隔线 DST 为 =====、MC/帕鲁为 -----。
// 用内联判断 + 单次正则替换（比逐行 split/map 快，避免大日志渲染卡顿）。
const logToHtml = (input: string): string => {
    let html = escapeHtml(input);
    html = html.replace(/^\[ERROR\].*$/gm, '<span style="color:#ff6e6e">$&</span>');
    html = html.replace(/^\[WARN(?:ING)?\].*$/gm, '<span style="color:#ffff6e">$&</span>');
    html = html.replace(/^\[INFO\].*$/gm, '<span style="color:#6eff6e">$&</span>');
    html = html.replace(/^[-=]+.*$/gm, '<span style="color:#6effff">$&</span>');
    html = html.replace(/^阶段 \d+\/\d+.*$/gm, '<span style="color:#6effff">$&</span>');
    html = html.replace(/^✅.*$/gm, '<span style="color:#6eff6e">$&</span>');
    return html;
};

// ============================================================
// 组件：读取服务器 MLSG-LOG 目录下的 .log 文件，多窗口显示
// ============================================================
const LogPane = styled.div`
    ${tw`bg-black rounded border border-neutral-600`};
`;

const LogTab = styled.button<{ active?: boolean }>`
    ${tw`px-3 py-2 text-sm rounded-t border border-b-0 cursor-pointer whitespace-nowrap transition-colors duration-100`};
    ${(props) =>
        props.active
            ? tw`text-neutral-100 bg-neutral-600 border-neutral-600`
            : tw`text-neutral-400 bg-neutral-800 border-neutral-700 hover:text-neutral-200 hover:bg-neutral-700`};
`;

const LogPre = styled.pre`
    ${tw`m-0 p-3 text-xs leading-relaxed text-neutral-200 overflow-auto whitespace-pre-wrap break-all font-mono max-h-[70vh]`};
`;

// 日志文件名 → 友好显示名（tab 标题）。未在表中的文件原样显示文件名。
const LOG_NAME_MAP: Record<string, string> = {
    'install.log': '安装日志',
    'pal_auto_mods.log': '帕鲁模组日志',
    'dst_auto_mod.log': '饥荒模组日志',
    'startup.log': '启动日志',
};

const displayName = (name: string): string => LOG_NAME_MAP[name] ?? name;

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const [files, setFiles] = useState<string[]>([]);
    const [contents, setContents] = useState<Record<string, string>>({});
    const [active, setActive] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 首次加载：只列目录取文件名（不读内容），避免并行读取所有日志拖慢首屏
    useEffect(() => {
        setLoading(true);
        setError(null);

        loadDirectory(uuid, 'MLSG-LOG')
            .then((list) => {
                // install.log（MC 安装日志）永远排在第一个，其余按文件名排序
                const logs = list
                    .filter((f) => f.isFile && f.name.toLowerCase().endsWith('.log'))
                    .map((f) => f.name)
                    .sort((a, b) => {
                        if (a === 'install.log') return -1;
                        if (b === 'install.log') return 1;
                        return a.localeCompare(b);
                    });
                setFiles(logs);
                setActive((prev) => (prev && logs.includes(prev) ? prev : logs[0] ?? null));
            })
            .catch((e) => setError(httpErrorToHuman(e)))
            .finally(() => setLoading(false));
    }, [uuid]);

    // 切换激活 tab 时按需读取内容（已读过的缓存跳过）
    useEffect(() => {
        if (!active || contents[active] !== undefined) return;
        getFileContents(uuid, `MLSG-LOG/${active}`)
            .then((content) => setContents((prev) => ({ ...prev, [active]: content })))
            .catch(() => setContents((prev) => ({ ...prev, [active]: `（读取失败：${active}）` })));
    }, [active, contents, uuid]);

    const activeHtml = useMemo(() => (active && contents[active] !== undefined ? logToHtml(contents[active]) : null), [active, contents]);

    return (
        <ServerContentBlock title={'安装日志'}>
            {loading ? (
                <Spinner centered size={Spinner.Size.LARGE} />
            ) : error || files.length === 0 ? (
                // 目录为空与目录不存在统一显示为简洁空态
                <p css={tw`text-sm text-neutral-400`}>没有日志文件。</p>
            ) : (
                <div>
                    <div css={tw`flex gap-1 overflow-x-auto pb-px`}>
                        {files.map((name) => (
                            <LogTab key={name} active={name === active} onClick={() => setActive(name)} title={name}>
                                {displayName(name)}
                            </LogTab>
                        ))}
                    </div>
                    <LogPane>
                        {activeHtml !== null ? (
                            <LogPre dangerouslySetInnerHTML={{ __html: activeHtml }} />
                        ) : (
                            <LogPre>（内容为空）</LogPre>
                        )}
                    </LogPane>
                </div>
            )}
        </ServerContentBlock>
    );
};
