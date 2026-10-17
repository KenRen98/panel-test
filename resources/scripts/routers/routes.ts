import React, { lazy } from 'react';
import {
    faArchive,
    faClock,
    faCogs,
    faDownload,
    faFolderOpen,
    faHistory,
    faNetworkWired,
    faPuzzlePiece,
    faSlidersH,
    faTerminal,
    faUserPlus,
    faWrench,
} from '@fortawesome/free-solid-svg-icons';
import { IconDefinition } from '@fortawesome/fontawesome-common-types';
import ServerConsole from '@/components/server/console/ServerConsoleContainer';
import DatabasesContainer from '@/components/server/databases/DatabasesContainer';
import ScheduleContainer from '@/components/server/schedules/ScheduleContainer';
import UsersContainer from '@/components/server/users/UsersContainer';
import BackupContainer from '@/components/server/backups/BackupContainer';
import NetworkContainer from '@/components/server/network/NetworkContainer';
import StartupContainer from '@/components/server/startup/StartupContainer';
import FileManagerContainer from '@/components/server/files/FileManagerContainer';
import SettingsContainer from '@/components/server/settings/SettingsContainer';
import AccountOverviewContainer from '@/components/dashboard/AccountOverviewContainer';
import AccountApiContainer from '@/components/dashboard/AccountApiContainer';
import AccountSSHContainer from '@/components/dashboard/ssh/AccountSSHContainer';
import ActivityLogContainer from '@/components/dashboard/activity/ActivityLogContainer';
import ServerActivityLogContainer from '@/components/server/ServerActivityLogContainer';

// Each of the router files is already code split out appropriately — so
// all of the items above will only be loaded in when that router is loaded.
//
// These specific lazy loaded routes are to avoid loading in heavy screens
// for the server dashboard when they're only needed for specific instances.
const FileEditContainer = lazy(() => import('@/components/server/files/FileEditContainer'));
const ScheduleEditContainer = lazy(() => import('@/components/server/schedules/ScheduleEditContainer'));

// 三个模组扩展页面（模组安装 / 模组管理 / 一键安装）独立分包：
// 只在进入对应路由时下载，避免打进 ServerRouter 主 chunk 拖慢所有服务器页面首屏。
const ModpackContainer = lazy(() => import('@/components/server/modpack/ModpackContainer'));
const SteammodContainer = lazy(() => import('@/components/server/steammod/SteammodContainer'));
const DstModManagerContainer = lazy(() => import('@/components/server/dstmodmanager/DstModManagerContainer'));

interface RouteDefinition {
    path: string;
    // If undefined is passed this route is still rendered into the router itself
    // but no navigation link is displayed in the sub-navigation menu.
    name: string | undefined;
    component: React.ComponentType;
    exact?: boolean;
}

interface ServerRouteDefinition extends RouteDefinition {
    permission: string | string[] | null;
    // 侧边栏分组：1/2/3。未指定则不参与分组导航（如隐藏的子路由）。
    group?: number;
    // 侧边栏导航项图标
    icon?: IconDefinition;
}

interface Routes {
    // All of the routes available under "/account"
    account: RouteDefinition[];
    // All of the routes available under "/server/:id"
    server: ServerRouteDefinition[];
}

export default {
    account: [
        {
            path: '/',
            name: '帐户',
            component: AccountOverviewContainer,
            exact: true,
        },
        {
            path: '/api',
            name: 'API 凭证',
            component: AccountApiContainer,
        },
        {
            path: '/ssh',
            name: 'SSH 密钥',
            component: AccountSSHContainer,
        },
        {
            path: '/activity',
            name: '活动日志',
            component: ActivityLogContainer,
        },
    ],
    server: [
        // ===== 组1 =====
        {
            path: '/',
            permission: null,
            name: '控制台',
            component: ServerConsole,
            exact: true,
            group: 1,
            icon: faTerminal,
        },
        {
            path: '/startup',
            permission: 'startup.*',
            name: '游戏参数',
            component: StartupContainer,
            group: 1,
            icon: faSlidersH,
        },
        {
            path: '/files',
            permission: 'file.*',
            name: '文件管理',
            component: FileManagerContainer,
            group: 1,
            icon: faFolderOpen,
        },
        {
            path: '/files/:action(edit|new)',
            permission: 'file.*',
            name: undefined,
            component: FileEditContainer,
        },
        {
            path: '/backups',
            permission: 'backup.*',
            name: '数据备份',
            component: BackupContainer,
            group: 1,
            icon: faArchive,
        },
        {
            path: '/modpack',
            permission: 'startup.*',
            name: '一键安装',
            component: ModpackContainer,
            group: 1,
            icon: faDownload,
        },
        {
            path: '/steammod',
            permission: 'startup.*',
            name: '模组安装',
            component: SteammodContainer,
            group: 1,
            icon: faPuzzlePiece,
        },
        {
            path: '/dstmodmanager',
            permission: 'startup.*',
            name: '模组管理',
            component: DstModManagerContainer,
            group: 1,
            icon: faWrench,
        },
        // ===== 组2 =====
        {
            path: '/network',
            permission: 'allocation.*',
            name: '网络端口',
            component: NetworkContainer,
            group: 2,
            icon: faNetworkWired,
        },
        {
            path: '/schedules',
            permission: 'schedule.*',
            name: '计划任务',
            component: ScheduleContainer,
            group: 2,
            icon: faClock,
        },
        {
            path: '/schedules/:id',
            permission: 'schedule.*',
            name: undefined,
            component: ScheduleEditContainer,
        },
        {
            path: '/settings',
            permission: ['settings.*', 'file.sftp'],
            name: '高级设置',
            component: SettingsContainer,
            group: 2,
            icon: faCogs,
        },
        // ===== 组3 =====
        {
            path: '/users',
            permission: 'user.*',
            name: '邀请用户',
            component: UsersContainer,
            group: 3,
            icon: faUserPlus,
        },
        {
            path: '/activity',
            permission: 'activity.*',
            name: '活动日志',
            component: ServerActivityLogContainer,
            group: 3,
            icon: faHistory,
        },
        // ===== 隐藏（路由保留可直达，导航不显示）=====
        {
            path: '/databases',
            permission: 'database.*',
            name: undefined,
            component: DatabasesContainer,
        },
    ],
} as Routes;
