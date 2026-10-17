import React from 'react';
import { NavLink, useRouteMatch } from 'react-router-dom';
import styled from 'styled-components/macro';
import tw, { theme } from 'twin.macro';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import Can from '@/components/elements/Can';
import routes from '@/routers/routes';
import { ServerContext } from '@/state/server';
import { useStoreState } from '@/state/hooks';
import { hasCapability } from '@/api/server/eggCapabilities';
import { hasSteamModCapability, hasDstModManagerCapability } from '@/api/server/steamMods';

const Nav = styled.nav`
    ${tw`flex flex-col px-2 py-3 gap-0.5`};

    @media (max-width: 1023px) {
        // 锁死视口宽（100vw，非 max-w-full——后者相对已撑宽的 body 无效），
        // 变量条内容在条内横滑，不再撑破布局/顶到页面边缘
        ${tw`flex-row items-center px-2 py-2 gap-1 min-w-0 max-w-[100vw]`};
        overflow-x: auto;
        scrollbar-width: none;

        &::-webkit-scrollbar {
            display: none;
        }
    }
`;

const Group = styled.div`
    ${tw`flex flex-col gap-0.5`};

    @media (max-width: 1023px) {
        // flex-shrink-0：导航项保持完整宽度，由 Nav 的 overflow-x 滚动而不是被压缩
        ${tw`flex-row items-center flex-shrink-0`};
    }
`;

const Separator = styled.div<{ collapsed?: boolean }>`
    height: 1px;
    margin: 8px 6px;
    background: ${theme`colors.neutral.600`.toString()};
    transition: margin 180ms ease, width 180ms ease;

    ${(props) => props.collapsed && tw`lg:mx-3 lg:w-auto`};

    @media (max-width: 1023px) {
        display: none;
    }
`;

const Item = styled(NavLink)<{ collapsed?: boolean }>`
    ${tw`flex items-center px-[14px] py-2 rounded text-sm text-neutral-300 no-underline whitespace-nowrap`};
    transition: color 150ms ease, background-color 150ms ease, height 150ms ease;

    &:hover {
        ${tw`text-neutral-100 bg-neutral-800`};
    }

    &.active {
        ${tw`text-neutral-100`};
        background: rgba(0, 0, 0, 0.35);
        box-shadow: inset 0 0 0 1px ${theme`colors.neutral.600`.toString()};
    }

    // 折叠态与展开态保持相同左 padding（14px）：Nav px-2 + 14 = 22px，
    // 图标 20px 宽 → 中心 32px = 64px 容器正中，且切换时零位移（不抖动）
    ${(props) => props.collapsed && tw`lg:h-9`};

    @media (max-width: 1023px) {
        ${tw`px-3 py-2`};
    }
`;

// 跳转管理后台：整页跳转 /admin（与顶部导航栏一致），样式与 Item 保持一致
const AdminLink = styled.a<{ collapsed?: boolean }>`
    ${tw`flex items-center px-[14px] py-2 rounded text-sm text-neutral-300 no-underline whitespace-nowrap cursor-pointer`};
    transition: color 150ms ease, background-color 150ms ease, height 150ms ease;

    &:hover {
        ${tw`text-neutral-100 bg-neutral-800`};
    }

    ${(props) => props.collapsed && tw`lg:h-9`};

    @media (max-width: 1023px) {
        ${tw`px-3 py-2`};
    }
`;

export default ({ collapsed = false }: { collapsed?: boolean }) => {
    const match = useRouteMatch<{ id: string }>();
    const rootAdmin = useStoreState((state) => state.user.data?.rootAdmin);
    const server = ServerContext.useStoreState((state) => state.server.data);
    const variables = ServerContext.useStoreState((state) => state.server.data?.variables);
    const hasModpack = hasCapability(variables, 'modpack');
    const hasSteamMod = hasSteamModCapability(variables);
    const hasDstModManager = hasDstModManagerCapability(variables);

    const to = (path: string) => {
        if (path === '/') {
            return match.url;
        }
        return `${match.url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
    };

    const visible = routes.server.filter(
        (route) =>
            !!route.name &&
            !(route.path === '/modpack' && !hasModpack) &&
            !(route.path === '/steammod' && !hasSteamMod) &&
            !(route.path === '/dstmodmanager' && !hasDstModManager)
    );

    const groups: number[] = [1, 2, 3];
    const rendered: React.ReactNode[] = [];

    groups.forEach((group) => {
        const items = visible.filter((route) => route.group === group);
        if (items.length === 0) {
            return;
        }

        if (rendered.length > 0) {
            rendered.push(<Separator key={`sep-${group}`} collapsed={collapsed} />);
        }

        rendered.push(
            <Group key={`group-${group}`}>
                {items.map((route) => {
                    // 统一渲染（折叠/展开同一 DOM 结构，无 Tooltip 包裹切换 → 不重挂载不抖动）
                    // 折叠时用原生 title 提示（等价 Tooltip 功能，且不改变 DOM 树）
                    const link = (
                        <Item
                            key={route.path}
                            to={to(route.path)}
                            exact={route.exact}
                            collapsed={collapsed}
                            title={collapsed ? route.name : undefined}
                        >
                            {route.icon && <FontAwesomeIcon icon={route.icon} fixedWidth />}
                            <span css={[tw`inline-block ml-3 max-w-[12rem] overflow-hidden transition-all duration-[180ms] ease-out`, collapsed && tw`lg:ml-0 lg:max-w-0 lg:opacity-0`]}>{route.name}</span>
                        </Item>
                    );

                    return route.permission ? (
                        <Can key={route.path} action={route.permission} matchAny>
                            {link}
                        </Can>
                    ) : (
                        link
                    );
                })}
            </Group>
        );
    });

    // 跳转管理后台（仅管理员可见）：跳到当前服务器的管理界面（/admin/servers/view/{DB id}），
    // 侧边模式与上方按钮组用分隔线隔开，顶部模式直接排最后
    if (rootAdmin) {
        const adminHref = `/admin/servers/view/${server?.internalId ?? ''}`;
        const adminLink = (
            <AdminLink href={adminHref} collapsed={collapsed} title={collapsed ? '跳转管理' : undefined}>
                <FontAwesomeIcon icon={faExternalLinkAlt} fixedWidth />
                <span css={[tw`inline-block ml-3 max-w-[12rem] overflow-hidden transition-all duration-[180ms] ease-out`, collapsed && tw`lg:ml-0 lg:max-w-0 lg:opacity-0`]}>
                    跳转管理
                </span>
            </AdminLink>
        );

        rendered.push(<Separator key={'sep-admin'} collapsed={collapsed} />);
        rendered.push(
            <Group key={'group-admin'}>
                {adminLink}
            </Group>
        );
    }

    return <Nav>{rendered}</Nav>;
};
