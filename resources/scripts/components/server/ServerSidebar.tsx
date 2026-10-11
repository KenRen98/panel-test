import React, { useState } from 'react';
import styled from 'styled-components/macro';
import tw, { theme } from 'twin.macro';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import ServerSubNavigation from '@/components/elements/ServerSubNavigation';
import { useStoreState } from 'easy-peasy';
import { ApplicationStore } from '@/state';

// 服务器内页全高侧边栏：贯穿整个视口高度，顶部放站点名称（logo），
// 与下方分组导航用分隔线区隔。桌面端左侧全高 sticky，覆盖原本顶部栏左侧区域。
// 手机端退化为全宽横向导航条（原始顶部栏样式），折叠按钮只在大屏显示。
const Aside = styled.aside<{ collapsed?: boolean }>`
    ${tw`flex flex-col bg-neutral-700 border-r border-neutral-600`};
    flex-shrink: 0;
    transition: width 150ms ease;

    @media (max-width: 1023px) {
        ${tw`w-full border-r-0 border-b`};
    }

    @media (min-width: 1024px) {
        ${(props) => (props.collapsed ? tw`w-16` : tw`w-64`)};
        height: 100vh;
        position: sticky;
        top: 0;
    }
`;

const Brand = styled.div<{ collapsed?: boolean }>`
    ${tw`flex items-center h-[3.5rem] px-4 border-b border-neutral-600 flex-shrink-0`};
    ${(props) => props.collapsed && tw`justify-center px-0`};

    @media (max-width: 1023px) {
        display: none;
    }
`;

const BrandLink = styled(Link)`
    ${tw`text-2xl font-header font-medium no-underline text-neutral-200 hover:text-neutral-100 transition-colors duration-150 whitespace-nowrap`};
`;

const NavScroll = styled.div`
    ${tw`flex-1 min-h-0`};

    @media (min-width: 1024px) {
        overflow-y: auto;
        overflow-x: hidden;
    }
`;

const CollapseButton = styled.button`
    ${tw`flex items-center justify-center h-10 text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 transition-colors duration-150 cursor-pointer border-t border-neutral-600`};

    @media (max-width: 1023px) {
        display: none;
    }
`;

export default () => {
    const [collapsed, setCollapsed] = useState(false);
    const name = useStoreState((state: ApplicationStore) => state.settings.data!.name);
    const logoTitle = useStoreState((state: ApplicationStore) => state.settings.data?.logo.title);

    return (
        <Aside collapsed={collapsed}>
            <Brand collapsed={collapsed}>
                <BrandLink to={'/'}>{logoTitle ? <img src={logoTitle} /> : name}</BrandLink>
            </Brand>
            <NavScroll>
                <ServerSubNavigation collapsed={collapsed} />
            </NavScroll>
            <CollapseButton
                onClick={() => setCollapsed((s) => !s)}
                aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
            >
                <FontAwesomeIcon icon={collapsed ? faChevronRight : faChevronLeft} fixedWidth />
            </CollapseButton>
        </Aside>
    );
};
