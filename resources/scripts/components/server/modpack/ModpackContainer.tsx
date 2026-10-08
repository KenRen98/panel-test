import React, { useEffect, useState } from 'react';
import { useRouteMatch } from 'react-router-dom';
import styled from 'styled-components/macro';
import tw from 'twin.macro';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import Spinner from '@/components/elements/Spinner';
import Button from '@/components/elements/Button';
import Modal from '@/components/elements/Modal';
import { ServerContext } from '@/state/server';
import { getModpacks, installModpack, matchGuoChanPackId, Modpack } from '@/api/server/modpacks';
import { useFlashKey } from '@/plugins/useFlash';
import { httpErrorToHuman } from '@/api/http';

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
`;

const Card = styled.div`
    ${tw`flex flex-col bg-neutral-800 border border-neutral-700 rounded-lg overflow-hidden transition-colors duration-150 hover:border-neutral-600`};
`;

const Logo = styled.img`
    ${tw`w-16 h-16 rounded-md object-cover bg-neutral-700 flex-shrink-0`};
`;

const Chip = styled.span`
    ${tw`inline-flex items-center text-[11px] px-2 py-0.5 rounded border border-neutral-600 bg-neutral-700 text-neutral-300`};
`;

const StepRow = styled.div`
    ${tw`flex items-center gap-2 text-sm text-neutral-300 py-2`};
    & > .num {
        ${tw`w-5 h-5 rounded-full flex items-center justify-center text-xs bg-neutral-700 border border-neutral-600 flex-shrink-0`};
    }
`;

export default () => {
    const match = useRouteMatch<{ id: string }>();
    const { clearFlashes, clearAndAddHttpError } = useFlashKey('modpack');

    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);
    const variables = ServerContext.useStoreState((state) => state.server.data!.variables);

    const [packs, setPacks] = useState<Modpack[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Modpack | null>(null);
    const [installing, setInstalling] = useState(false);

    const hasGuoChanEgg = variables.some((v) => v.envVariable === 'GUOCHAN_PACK_ID');

    useEffect(() => {
        clearFlashes();

        getModpacks()
            .then((data) => setPacks(data.filter((p) => p.is_active)))
            .catch((e) => {
                console.error(e);
                setError(httpErrorToHuman(e));
            });
    }, []);

    const handleInstall = async () => {
        if (!selected) {
            return;
        }

        setInstalling(true);
        clearFlashes();

        try {
            await installModpack(uuid, variables, selected.id);
            // 安装成功后直接跳转到控制台页面。
            window.location.href = `/server/${match.params.id}`;
        } catch (e) {
            console.error(e);
            clearAndAddHttpError(e);
            setInstalling(false);
        }
    };

    if (!hasGuoChanEgg) {
        return (
            <ServerContentBlock title={'国产模组包'}>
                <div css={tw`text-sm text-neutral-300`}>
                    当前服务器未使用全能 MC egg，无法使用一键安装功能。
                </div>
            </ServerContentBlock>
        );
    }

    if (error) {
        return (
            <ServerContentBlock title={'国产模组包'} showFlashKey={'modpack'}>
                <div css={tw`text-sm text-red-400`}>加载模组包列表失败：{error}</div>
            </ServerContentBlock>
        );
    }

    return (
        <ServerContentBlock title={'国产模组包'} showFlashKey={'modpack'}>
            <div css={tw`flex items-center mb-6`}>
                <div css={tw`flex items-center gap-3`}>
                    <div
                        css={tw`w-10 h-10 rounded-lg bg-primary-500 flex items-center justify-center text-primary-50 flex-shrink-0`}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                        </svg>
                    </div>
                    <div>
                        <h1 css={tw`text-xl font-bold`}>国产模组包</h1>
                        <p css={tw`text-sm text-neutral-400 mt-0.5`}>选择一个整合包，一键切换服务器模式并自动安装。</p>
                    </div>
                </div>
                {packs && (
                    <span
                        css={tw`ml-auto inline-flex items-center h-9 px-3 rounded-lg border border-neutral-600 bg-neutral-800 text-xs text-neutral-400 whitespace-nowrap`}
                    >
                        总计：{packs.length}个
                    </span>
                )}
            </div>

            {!packs ? (
                <Spinner centered size={Spinner.Size.LARGE} />
            ) : (
                <Grid>
                    {packs.map((pack) => {
                        const installable = matchGuoChanPackId(variables, pack.id) !== null;
                        return (
                            <Card key={pack.id}>
                                <div css={tw`p-4 flex gap-3 items-start`}>
                                    <Logo src={pack.logo_url} alt={pack.name} />
                                    <div css={tw`min-w-0`}>
                                        <div css={tw`font-semibold text-neutral-100 truncate`}>{pack.name}</div>
                                        <div css={tw`text-xs text-neutral-400 mt-0.5`}>v{pack.version}</div>
                                    </div>
                                </div>
                                <div
                                    css={tw`px-4 text-xs text-neutral-400 line-clamp-3 flex-1 leading-relaxed`}
                                >
                                    {pack.description}
                                </div>
                                <div css={tw`px-4 mt-3 flex flex-wrap gap-1.5`}>
                                    {pack.mc_version && <Chip>MC {pack.mc_version}</Chip>}
                                    {pack.java_version && <Chip>Java {pack.java_version}</Chip>}
                                    <Chip>{pack.total_mods} 模组</Chip>
                                </div>
                                <div css={tw`p-4`}>
                                    <Button
                                        size={'small'}
                                        color={installable ? 'primary' : 'grey'}
                                        disabled={!installable}
                                        onClick={() => installable && setSelected(pack)}
                                    >
                                        {installable ? '一键安装' : '未登记'}
                                    </Button>
                                </div>
                            </Card>
                        );
                    })}
                </Grid>
            )}

            <Modal visible={!!selected} onDismissed={() => !installing && setSelected(null)} dismissable={!installing}>
                {selected && (
                    <>
                        <div css={tw`text-lg font-semibold`}>确认安装《{selected.name}》</div>
                        <div css={tw`text-sm text-neutral-400 mt-1`}>
                            将切换服务器类型为 GuoChan 并安装该整合包，随后触发重装并跳转到控制台。
                        </div>
                        <div css={tw`mt-3`}>
                            <StepRow>
                                <span className={'num'}>1</span>
                                切换服务器类型为 GuoChan (整合包)
                            </StepRow>
                            <StepRow>
                                <span className={'num'}>2</span>
                                设置模组包 ID 为 ({selected.id})
                            </StepRow>
                            <StepRow>
                                <span className={'num'}>3</span>
                                触发服务器重装
                            </StepRow>
                        </div>
                        <div css={tw`mt-6 flex justify-end gap-3`}>
                            <Button color={'grey'} isSecondary disabled={installing} onClick={() => setSelected(null)}>
                                取消
                            </Button>
                            <Button color={'primary'} isLoading={installing} onClick={handleInstall}>
                                开始安装
                            </Button>
                        </div>
                    </>
                )}
            </Modal>
        </ServerContentBlock>
    );
};
