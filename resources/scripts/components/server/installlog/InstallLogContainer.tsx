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
const PREFIX_RULES: Array<{ test: RegExp; color: string }> = [
    { test: /^\[ERROR\]/, color: '#ff6e6e' },
    { test: /^\[WARN\]/, color: '#ffff6e' },
    { test: /^\[INFO\]/, color: '#6eff6e' },
    { test: /^=+/, color: '#6effff' },
    { test: /^阶段 \d+\/\d+/, color: '#6effff' },
    { test: /^✅/, color: '#6eff6e' },
];

const escapeHtml = (s: string): string =>
    s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const logToHtml = (input: string): string => {
    const lines = input.split('\n');
    return lines
        .map((line) => {
            const esc = escapeHtml(line);
            const rule = PREFIX_RULES.find((r) => r.test(line));
            return rule ? `<span style="color:${rule.color}">${esc}</span>` : esc;
        })
        .join('\n');
};

// ============================================================
// 组件：读取服务器 MLSG-LOG 目录下的 .log 文件，多窗口显示
// ============================================================
const LogPane = styled.div`
    ${tw`bg-black rounded border border-neutral-600`};
`;

const LogTab = styled.button<{ active?: boolean }>`
    ${tw`px-3 py-2 text-sm rounded-t border border-b-0 text-neutral-300 hover:text-neutral-100 bg-neutral-800 cursor-pointer whitespace-nowrap`};
    ${(props) => props.active && tw`text-neutral-100 bg-neutral-700 border-neutral-600`};
`;

const LogPre = styled.pre`
    ${tw`m-0 p-3 text-xs leading-relaxed text-neutral-200 overflow-auto whitespace-pre-wrap break-all font-mono max-h-[70vh]`};
`;

export default () => {
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const [files, setFiles] = useState<string[]>([]);
    const [contents, setContents] = useState<Record<string, string>>({});
    const [active, setActive] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);

        loadDirectory(uuid, 'MLSG-LOG')
            .then((list) => {
                const logs = list.filter((f) => f.isFile && f.name.toLowerCase().endsWith('.log')).map((f) => f.name);
                setFiles(logs);
                setActive((prev) => prev && logs.includes(prev) ? prev : (logs[0] ?? null));
                return Promise.all(
                    logs.map((name) =>
                        getFileContents(uuid, `MLSG-LOG/${name}`)
                            .then((content) => ({ name, content }))
                            .catch(() => ({ name, content: `（读取失败：${name}）` }))
                    )
                );
            })
            .then((entries) => {
                const map: Record<string, string> = {};
                entries.forEach((e) => {
                    map[e.name] = e.content;
                });
                setContents(map);
            })
            .catch((e) => setError(httpErrorToHuman(e)))
            .finally(() => setLoading(false));
    }, [uuid]);

    const activeHtml = useMemo(() => (active && contents[active] !== undefined ? logToHtml(contents[active]) : null), [active, contents]);

    return (
        <ServerContentBlock title={'安装日志'}>
            {loading ? (
                <Spinner centered size={Spinner.Size.LARGE} />
            ) : error ? (
                <p css={tw`text-sm text-neutral-400`}>
                    无法读取 MLSG-LOG 目录：{error}
                    <br />
                    <span css={tw`text-neutral-500`}>安装脚本运行后会在服务器根目录生成 MLSG-LOG 日志文件夹。</span>
                </p>
            ) : files.length === 0 ? (
                <p css={tw`text-sm text-neutral-400`}>MLSG-LOG 目录下暂无 .log 日志文件。</p>
            ) : (
                <div>
                    <div css={tw`flex gap-1 overflow-x-auto pb-px`}>
                        {files.map((name) => (
                            <LogTab key={name} active={name === active} onClick={() => setActive(name)}>
                                {name}
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
