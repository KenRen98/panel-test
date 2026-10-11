import * as React from 'react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCogs, faLayerGroup, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import { useStoreState } from 'easy-peasy';
import { ApplicationStore } from '@/state';
import SearchContainer from '@/components/dashboard/search/SearchContainer';
import tw from 'twin.macro';
import styled from 'styled-components/macro';
import http from '@/api/http';
import SpinnerOverlay from '@/components/elements/SpinnerOverlay';
import Tooltip from '@/components/elements/tooltip/Tooltip';
import Avatar from '@/components/Avatar';

interface Props {
    // 可选的导航区（例如服务器侧边栏分组导航），渲染在品牌与全局入口之间。
    children?: React.ReactNode;
}

const Sidebar = styled.aside`
    ${tw`flex flex-col bg-white border-b border-neutral-700 w-full`};
    flex-shrink: 0;

    @media (min-width: 1024px) {
        ${tw`border-b-0 border-r`};
        width: 16rem;
        min-height: 100vh;
        height: 100vh;
        position: sticky;
        top: 0;
        overflow-y: auto;
    }
`;

const Brand = styled.div`
    ${tw`flex items-center h-14 px-4 border-b border-neutral-700`};
    flex-shrink: 0;
`;

const NavSlot = styled.div`
    ${tw`overflow-x-auto`};
    scrollbar-width: none;
    flex: 1;

    &::-webkit-scrollbar {
        display: none;
    }

    @media (min-width: 1024px) {
        overflow-x: visible;
        overflow-y: auto;
    }
`;

const GlobalLinks = styled.div`
    ${tw`flex items-center border-t border-neutral-700`};
    flex-shrink: 0;

    & > a,
    & > button,
    & > .navigation-link {
        ${tw`flex items-center h-14 no-underline text-neutral-300 px-5 cursor-pointer transition-all duration-150`};

        &:hover {
            ${tw`text-neutral-100 bg-neutral-700`};
        }
    }

    @media (min-width: 1024px) {
        ${tw`flex-col`};

        & > a,
        & > button,
        & > .navigation-link {
            ${tw`w-full h-12`};
        }
    }
`;

export default ({ children }: Props) => {
    const name = useStoreState((state: ApplicationStore) => state.settings.data!.name);
    const rootAdmin = useStoreState((state: ApplicationStore) => state.user.data!.rootAdmin);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const onTriggerLogout = () => {
        setIsLoggingOut(true);
        http.post('/auth/logout').finally(() => {
            // @ts-expect-error this is valid
            window.location = '/';
        });
    };

    return (
        <Sidebar>
            <SpinnerOverlay visible={isLoggingOut} />
            <Brand>
                <Link
                    to={'/'}
                    className={
                        'text-2xl font-header font-medium px-2 no-underline text-neutral-200 hover:text-neutral-100 transition-colors duration-150'
                    }
                >
                    {useStoreState((state) => {
                        const logoTitle = state.settings.data?.logo.title;
                        return logoTitle ? <img src={logoTitle} /> : name;
                    })}
                </Link>
            </Brand>
            {children && <NavSlot>{children}</NavSlot>}
            <GlobalLinks>
                <SearchContainer />
                <Tooltip placement={'bottom'} content={'仪表盘'}>
                    <NavLink to={'/'} exact>
                        <FontAwesomeIcon icon={faLayerGroup} />
                    </NavLink>
                </Tooltip>
                {rootAdmin && (
                    <Tooltip placement={'bottom'} content={'管理员后台'}>
                        <a href={'/admin'} rel={'noreferrer'}>
                            <FontAwesomeIcon icon={faCogs} />
                        </a>
                    </Tooltip>
                )}
                <Tooltip placement={'bottom'} content={'账号设置'}>
                    <NavLink to={'/account'}>
                        <span className={'flex items-center w-5 h-5'}>
                            <Avatar.User />
                        </span>
                    </NavLink>
                </Tooltip>
                <Tooltip placement={'bottom'} content={'登出'}>
                    <button onClick={onTriggerLogout}>
                        <FontAwesomeIcon icon={faSignOutAlt} />
                    </button>
                </Tooltip>
            </GlobalLinks>
        </Sidebar>
    );
};
