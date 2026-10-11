import React, { useState } from 'react';
import styled from 'styled-components/macro';
import tw from 'twin.macro';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import ServerSubNavigation from '@/components/elements/ServerSubNavigation';

// 服务器内页专用侧边栏：只承载分组导航（控制台/游戏参数/文件管理/…）。
// 5 个全局图标按钮与 logo 都在顶部栏（NavigationBar）里，这里不放。
// 底色比内容区（bg-neutral-800）浅一档（bg-neutral-700）做区隔；
// 手机端退化为全宽横向导航条（原版顶部栏样式），折叠按钮只在大屏显示。
const Aside = styled.aside<{ collapsed?: boolean }>`
    ${tw`flex flex-col bg-neutral-700 border-r border-neutral-600`};
    flex-shrink: 0;
    transition: width 150ms ease;

    @media (max-width: 1023px) {
        ${tw`w-full border-r-0 border-b`};
    }

    @media (min-width: 1024px) {
        ${(props) => (props.collapsed ? tw`w-16` : tw`w-64`)};
        height: calc(100vh - 3.5rem);
        position: sticky;
        top: 3.5rem;
    }
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

    return (
        <Aside collapsed={collapsed}>
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
