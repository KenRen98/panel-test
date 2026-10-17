import React, { memo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import tw from 'twin.macro';
import isEqual from 'react-fast-compare';

interface Props {
    icon?: IconProp;
    title: string | React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

const TitledGreyBox = ({ icon, title, children, className }: Props) => (
    // min-w-0：grid/flex 子项默认 min-width:auto，内容（长命令/长描述）会把列撑宽，
    // 导致整页布局超宽（一二级菜单被推出视口）
    <div css={tw`rounded shadow-md bg-neutral-700 min-w-0`} className={className}>
        <div css={tw`bg-neutral-900 rounded-t p-3 border-b border-black`}>
            {typeof title === 'string' ? (
                <p css={tw`text-sm uppercase`}>
                    {icon && <FontAwesomeIcon icon={icon} css={tw`mr-2 text-neutral-300`} />}
                    {title}
                </p>
            ) : (
                title
            )}
        </div>
        <div css={tw`p-3`}>{children}</div>
    </div>
);

export default memo(TitledGreyBox, isEqual);
