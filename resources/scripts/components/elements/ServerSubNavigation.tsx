import React from 'react';
import { NavLink, useRouteMatch } from 'react-router-dom';
import styled from 'styled-components/macro';
import tw, { theme } from 'twin.macro';
import Can from '@/components/elements/Can';
import routes from '@/routers/routes';
import { ServerContext } from '@/state/server';

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

const Separator = styled.div`
    height: 1px;
    margin: 8px 6px;
    background: ${theme`colors.neutral.700`.toString()};

    @media (max-width: 1023px) {
        display: none;
    }
`;

const Item = styled(NavLink)`
    ${tw`flex items-center px-3 py-2 rounded text-sm text-neutral-300 no-underline whitespace-nowrap transition-all duration-150`};

    &:hover {
        ${tw`text-neutral-100 bg-neutral-700`};
    }

    &.active {
        ${tw`text-neutral-100`};
        background: rgba(7, 116, 255, 0.10);
        box-shadow: inset 0 0 0 1px ${theme`colors.blue.500`.toString()};
    }

    @media (max-width: 1023px) {
        ${tw`px-3 py-2`};
    }
`;

export default () => {
    const match = useRouteMatch<{ id: string }>();
    const variables = ServerContext.useStoreState((state) => state.server.data?.variables);
    const hasModpack = !!variables?.some((v) => v.envVariable === 'GUOCHAN_PACK_ID');

    const to = (path: string) => {
        if (path === '/') {
            return match.url;
        }
        return `${match.url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
    };

    const visible = routes.server.filter((route) => !!route.name && !(route.path === '/modpack' && !hasModpack));

    const groups: number[] = [1, 2, 3];
    const rendered: React.ReactNode[] = [];

    groups.forEach((group) => {
        const items = visible.filter((route) => route.group === group);
        if (items.length === 0) {
            return;
        }

        if (rendered.length > 0) {
            rendered.push(<Separator key={`sep-${group}`} />);
        }

        rendered.push(
            <Group key={`group-${group}`}>
                {items.map((route) => {
                    const link = (
                        <Item key={route.path} to={to(route.path)} exact={route.exact}>
                            {route.name}
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

    return <Nav>{rendered}</Nav>;
};
