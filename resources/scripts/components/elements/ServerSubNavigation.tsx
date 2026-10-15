import React from 'react';
import { NavLink, useRouteMatch } from 'react-router-dom';
import styled from 'styled-components/macro';
import tw, { theme } from 'twin.macro';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Can from '@/components/elements/Can';
import routes from '@/routers/routes';
import { ServerContext } from '@/state/server';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import { hasCapability } from '@/api/server/eggCapabilities';
import { hasSteamModCapability } from '@/api/server/steamMods';

const Nav = styled.nav`
    ${tw`flex flex-col px-2 py-3 gap-0.5`};

    @media (max-width: 1023px) {
        ${tw`flex-row items-center px-2 py-2 gap-1`};
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
        ${tw`flex-row items-center`};
    }
`;

const Separator = styled.div<{ collapsed?: boolean }>`
    height: 1px;
    margin: 8px 6px;
    background: ${theme`colors.neutral.600`.toString()};

    ${(props) => props.collapsed && tw`lg:mx-3 lg:w-auto`};

    @media (max-width: 1023px) {
        display: none;
    }
`;

const Item = styled(NavLink)<{ collapsed?: boolean }>`
    ${tw`flex items-center px-3 py-2 rounded text-sm text-neutral-300 no-underline whitespace-nowrap transition-all duration-150`};

    &:hover {
        ${tw`text-neutral-100 bg-neutral-800`};
    }

    &.active {
        ${tw`text-neutral-100`};
        background: rgba(0, 0, 0, 0.35);
        box-shadow: inset 0 0 0 1px ${theme`colors.neutral.600`.toString()};
    }

    ${(props) => props.collapsed && tw`lg:pl-[15px] lg:pr-0 lg:h-9`};

    @media (max-width: 1023px) {
        ${tw`px-3 py-2`};
    }
`;

export default ({ collapsed = false }: { collapsed?: boolean }) => {
    const match = useRouteMatch<{ id: string }>();
    const variables = ServerContext.useStoreState((state) => state.server.data?.variables);
    const hasModpack = hasCapability(variables, 'modpack');
    const hasSteamMod = hasSteamModCapability(variables);

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
            !(route.path === '/steammod' && !hasSteamMod)
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
                    const link = (
                        <Item key={route.path} to={to(route.path)} exact={route.exact} collapsed={collapsed}>
                            {route.icon && <FontAwesomeIcon icon={route.icon} fixedWidth />}
                            <span css={[tw`inline-block ml-3 max-w-[12rem] overflow-hidden transition-all duration-[180ms]`, collapsed && tw`lg:ml-0 lg:max-w-0 lg:opacity-0`]}>{route.name}</span>
                        </Item>
                    );

                    const wrapped = collapsed ? (
                        <Tooltip key={route.path} placement={'right'} content={route.name!}>
                            {link}
                        </Tooltip>
                    ) : (
                        link
                    );

                    return route.permission ? (
                        <Can key={route.path} action={route.permission} matchAny>
                            {wrapped}
                        </Can>
                    ) : (
                        wrapped
                    );
                })}
            </Group>
        );
    });

    return <Nav>{rendered}</Nav>;
};
