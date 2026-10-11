import TransferListener from '@/components/server/TransferListener';
import React, { useEffect, useState } from 'react';
import { Route, Switch, useRouteMatch } from 'react-router-dom';
import NavigationBar from '@/components/NavigationBar';
import TransitionRouter from '@/TransitionRouter';
import WebsocketHandler from '@/components/server/WebsocketHandler';
import { ServerContext } from '@/state/server';
import Spinner from '@/components/elements/Spinner';
import { NotFound, ServerError } from '@/components/elements/ScreenBlock';
import { httpErrorToHuman } from '@/api/http';
import { useStoreState } from 'easy-peasy';
import tw from 'twin.macro';
import ServerSidebar from '@/components/server/ServerSidebar';
import ServerSubNavigation from '@/components/elements/ServerSubNavigation';
import InstallListener from '@/components/server/InstallListener';
import ErrorBoundary from '@/components/elements/ErrorBoundary';
import { useLocation } from 'react-router';
import ConflictStateRenderer from '@/components/server/ConflictStateRenderer';
import PermissionRoute from '@/components/elements/PermissionRoute';
import routes from '@/routers/routes';

export default () => {
    const match = useRouteMatch<{ id: string }>();
    const location = useLocation();

    const rootAdmin = useStoreState((state) => state.user.data!.rootAdmin);
    const [error, setError] = useState('');

    const id = ServerContext.useStoreState((state) => state.server.data?.id);
    const uuid = ServerContext.useStoreState((state) => state.server.data?.uuid);
    const inConflictState = ServerContext.useStoreState((state) => state.server.inConflictState);
    const getServer = ServerContext.useStoreActions((actions) => actions.server.getServer);
    const clearServerState = ServerContext.useStoreActions((actions) => actions.clearServerState);

    const to = (value: string, url = false) => {
        if (value === '/') {
            return url ? match.url : match.path;
        }
        return `${(url ? match.url : match.path).replace(/\/*$/, '')}/${value.replace(/^\/+/, '')}`;
    };

    useEffect(
        () => () => {
            clearServerState();
        },
        []
    );

    useEffect(() => {
        setError('');

        getServer(match.params.id).catch((error) => {
            console.error(error);
            setError(httpErrorToHuman(error));
        });

        return () => {
            clearServerState();
        };
    }, [match.params.id]);

    return (
        <React.Fragment key={'server-router'}>
            <div css={tw`flex flex-col lg:flex-row min-h-screen`}>
                {/* 桌面端：全高侧边栏贯穿视口，覆盖原本顶部栏左侧区域 */}
                <div css={tw`hidden lg:flex lg:flex-shrink-0`}>
                    <ServerSidebar />
                </div>
                {/* 桌面端右侧：顶部栏（不再横向贯穿）+ 内容 */}
                <div css={tw`flex flex-1 flex-col min-w-0`}>
                    <NavigationBar />
                    {/* 手机端：原始顶部栏样式，横向导航条 */}
                    <div css={tw`lg:hidden`}>
                        <ServerSubNavigation />
                    </div>
                    <div css={tw`flex-1 min-w-0`}>
                    {!uuid || !id ? (
                        error ? (
                            <ServerError message={error} />
                        ) : (
                            <Spinner size={'large'} centered />
                        )
                    ) : (
                        <>
                            <InstallListener />
                            <TransferListener />
                            <WebsocketHandler />
                            {inConflictState && (!rootAdmin || (rootAdmin && !location.pathname.endsWith(`/server/${id}`))) ? (
                                <ConflictStateRenderer />
                            ) : (
                                <ErrorBoundary>
                                    <TransitionRouter>
                                        <Switch location={location}>
                                            {routes.server.map(({ path, permission, component: Component }) => (
                                                <PermissionRoute key={path} permission={permission} path={to(path)} exact>
                                                    <Spinner.Suspense>
                                                        <Component />
                                                    </Spinner.Suspense>
                                                </PermissionRoute>
                                            ))}
                                            <Route path={'*'} component={NotFound} />
                                        </Switch>
                                    </TransitionRouter>
                                </ErrorBoundary>
                            )}
                        </>
                    )}
                </div>
                </div>
            </div>
        </React.Fragment>
    );
};
