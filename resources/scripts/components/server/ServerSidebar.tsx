import React from 'react';
import styled from 'styled-components/macro';
import tw from 'twin.macro';
import ServerSubNavigation from '@/components/elements/ServerSubNavigation';

// 服务器内页专用侧边栏：只承载分组导航（控制台/游戏参数/文件管理/…）。
// 5 个全局图标按钮与 logo 都在顶部栏（NavigationBar）里，这里不放。
const Aside = styled.aside`
    ${tw`bg-neutral-900 border-r border-neutral-700`};
    flex-shrink: 0;

    @media (max-width: 1023px) {
        ${tw`w-full border-r-0 border-b`};
    }

    @media (min-width: 1024px) {
        width: 16rem;
        min-height: calc(100vh - 3.5rem);
        position: sticky;
        top: 3.5rem;
        overflow-y: auto;
    }
`;

export default () => (
    <Aside>
        <ServerSubNavigation />
    </Aside>
);
