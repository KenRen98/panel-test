import React, { useState } from 'react';
import styled from 'styled-components/macro';
import tw, { theme } from 'twin.macro';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import ServerSubNavigation from '@/components/elements/ServerSubNavigation';
import { useStoreState } from 'easy-peasy';
import { ApplicationStore } from '@/state';

// 折叠时顶部展示的品牌 logo：放在 public/favicons 下（该目录被 git 跟踪、不经 webpack
// 打包），用静态 URL 引用。不能放 public/assets 里用 import，否则 png 走 file-loader
// 会在 Node22 下触发 MD4 哈希报错。
const LOGO_URL = '/assets/svgs/logo.png';

// 服务器内页全高侧边栏：贯穿整个视口高度，顶部放站点名称（logo），
// 与下方分组导航用分隔线区隔。桌面端左侧全高 sticky，覆盖原本顶部栏左侧区域。
// 手机端退化为全宽横向导航条（原始顶部栏样式），折叠按钮只在大屏显示。
const Aside = styled.aside<{ collapsed?: boolean }>`
    ${tw`flex flex-col bg-neutral-700 border-r border-neutral-600`};
    flex-shrink: 0;
    transition: width 180ms cubic-bezier(0.4, 0, 0.2, 1);

    @media (max-width: 1023px) {
        ${tw`w-full border-r-0 border-b`};
    }

    @media (min-width: 1024px) {
        ${(props) => (props.collapsed ? tw`w-16` : tw`w-[140px]`)};
        height: 100vh;
        position: sticky;
        top: 0;
    }
`;

const Brand = styled.div`
    ${tw`flex items-center h-[3.5rem] px-4 border-b border-neutral-600 flex-shrink-0`};

    @media (max-width: 1023px) {
        display: none;
    }
`;

// inline-flex：tailwind preflight 会把 img 置为 display:block，若 a 不是 flex 容器，
// block 的 logo 会独占一行把站点名挤到下一行（单文本时代无此问题）。
const BrandLink = styled(Link)`
    ${tw`inline-flex items-center text-2xl font-header font-medium no-underline text-neutral-200 hover:text-neutral-100 transition-colors duration-150 whitespace-nowrap flex-shrink-0 max-w-full`};
`;

const BrandLogo = styled.img`
    ${tw`h-8 w-8 object-contain rounded-md flex-shrink-0`};
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

    return (
        <Aside collapsed={collapsed}>
            <Brand>
                <BrandLink to={'/'}>
                    {/* 恒定结构（logo + 站点名始终渲染），折叠时仅用 CSS 隐藏站点名——
                        避免 React 条件渲染在宽度过渡期间引起重排抖动 */}
                    <BrandLogo src={LOGO_URL} alt={'logo'} />
                    <span
                        css={[
                            tw`ml-2 truncate transition-all duration-[180ms] ease-out`,
                            collapsed ? tw`lg:ml-0 lg:max-w-0 lg:opacity-0 overflow-hidden` : tw`max-w-[calc(140px-2rem-2rem-0.5rem)]`,
                        ]}
                    >
                        {name}
                    </span>
                </BrandLink>
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
