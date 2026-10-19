import React, { useEffect, useMemo, useState } from 'react';
import {
    faCalendarAlt,
    faClock,
    faCloudDownloadAlt,
    faCloudUploadAlt,
    faHdd,
    faMemory,
    faMicrochip,
    faWifi,
} from '@fortawesome/free-solid-svg-icons';
import { bytesToString, ip, mbToBytes } from '@/lib/formatters';
import { ServerContext } from '@/state/server';
import { SocketEvent, SocketRequest } from '@/components/server/events';
import UptimeDuration from '@/components/server/UptimeDuration';
import StatBlock from '@/components/server/console/StatBlock';
import useWebsocketEvent from '@/plugins/useWebsocketEvent';
import classNames from 'classnames';
import { ServerStatus } from '@/state/server';
import getServerDueDate, { ServerDueDate } from '@/api/server/getServerDueDate';

const statusMap: Record<NonNullable<ServerStatus>, string> = {
    offline: '离线',
    starting: '启动中',
    stopping: '停止中',
    running: '运行中',
};

type Stats = Record<'memory' | 'cpu' | 'disk' | 'uptime' | 'rx' | 'tx', number>;

const getBackgroundColor = (value: number, max: number | null): string | undefined => {
    const delta = !max ? 0 : value / max;

    if (delta > 0.8) {
        if (delta > 0.9) {
            return 'bg-red-500';
        }
        return 'bg-yellow-500';
    }

    return undefined;
};

// 以 UTC 日历日计算剩余天数，避免用户时区造成 ±1 天偏差
const daysUntil = (due: string): number => {
    const dueMs = Date.parse(due + 'T00:00:00Z');
    if (Number.isNaN(dueMs)) return 0;
    const now = new Date();
    const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((dueMs - todayMs) / 86400000);
};

const dueLabel = (due: string): string => {
    const d = daysUntil(due);
    if (d < 0) return '已过期';
    if (d === 0) return '今天到期';
    return `剩 ${d} 天`;
};

const Limit = ({ limit, children }: { limit: string | null; children: React.ReactNode }) => (
    <>
        {children}
        <span className={'ml-1 text-gray-300 text-[70%] select-none'}>/ {limit || <>&infin;</>}</span>
    </>
);

const ServerDetailsBlock = ({ className }: { className?: string }) => {
    const [stats, setStats] = useState<Stats>({ memory: 0, cpu: 0, disk: 0, uptime: 0, tx: 0, rx: 0 });
    const [due, setDue] = useState<ServerDueDate | null>(null);
    const [dueLoading, setDueLoading] = useState(true);

    const status = ServerContext.useStoreState((state) => state.status.value);
    const connected = ServerContext.useStoreState((state) => state.socket.connected);
    const instance = ServerContext.useStoreState((state) => state.socket.instance);
    const limits = ServerContext.useStoreState((state) => state.server.data!.limits);
    const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

    const textLimits = useMemo(
        () => ({
            cpu: limits?.cpu ? `${limits.cpu}%` : null,
            memory: limits?.memory ? bytesToString(mbToBytes(limits.memory)) : null,
            disk: limits?.disk ? bytesToString(mbToBytes(limits.disk)) : null,
        }),
        [limits]
    );

    const allocation = ServerContext.useStoreState((state) => {
        const match = state.server.data!.allocations.find((allocation) => allocation.isDefault);

        return !match ? 'n/a' : `${match.alias || ip(match.ip)}:${match.port}`;
    });

    useEffect(() => {
        if (!connected || !instance) {
            return;
        }

        instance.send(SocketRequest.SEND_STATS);
    }, [instance, connected]);

    useWebsocketEvent(SocketEvent.STATS, (data) => {
        let stats: any = {};
        try {
            stats = JSON.parse(data);
        } catch (e) {
            return;
        }

        setStats({
            memory: stats.memory_bytes,
            cpu: stats.cpu_absolute,
            disk: stats.disk_bytes,
            tx: stats.network.tx_bytes,
            rx: stats.network.rx_bytes,
            uptime: stats.uptime || 0,
        });
    });

    // 到期时间：挂载时拉取一次（数据低频变化）；无 external_id 或 API 不可用时静默降级为 —
    useEffect(() => {
        if (!uuid) {
            setDueLoading(false);
            return;
        }

        getServerDueDate(uuid)
            .then((data) => setDue(data))
            .catch(() => setDue(null))
            .finally(() => setDueLoading(false));
    }, [uuid]);

    const dueColor = useMemo(() => {
        if (!due?.next_due) return undefined;
        const d = daysUntil(due.next_due);
        if (d < 0) return 'bg-red-500';
        if (d <= 7) return 'bg-yellow-500';
        return undefined;
    }, [due]);

    return (
        <div className={classNames('grid grid-cols-6 gap-2 md:gap-4', className)}>
            <StatBlock icon={faWifi} title={'地址'} copyOnClick={allocation}>
                {allocation}
            </StatBlock>
            <StatBlock
                icon={faClock}
                title={'正常运行时间'}
                color={getBackgroundColor(status === 'running' ? 0 : status !== 'offline' ? 9 : 10, 10)}
            >
                {status === null ? (
                    '离线'
                ) : stats.uptime > 0 ? (
                    <UptimeDuration uptime={stats.uptime / 1000} />
                ) : (
                    statusMap[status] ?? '未知状态'
                )}
            </StatBlock>
            <StatBlock icon={faMicrochip} title={'CPU'} color={getBackgroundColor(stats.cpu, limits.cpu)}>
                {status === 'offline' ? (
                    <span className={'text-gray-400'}>离线</span>
                ) : (
                    <Limit limit={textLimits.cpu}>{stats.cpu.toFixed(2)}%</Limit>
                )}
            </StatBlock>
            <StatBlock
                icon={faMemory}
                title={'内存'}
                color={getBackgroundColor(stats.memory / 1024, limits.memory * 1024)}
            >
                {status === 'offline' ? (
                    <span className={'text-gray-400'}>离线</span>
                ) : (
                    <Limit limit={textLimits.memory}>{bytesToString(stats.memory)}</Limit>
                )}
            </StatBlock>
            <StatBlock
                icon={faHdd}
                title={'存储空间'}
                color={getBackgroundColor(stats.disk / 1024, limits.disk * 1024)}
            >
                <Limit limit={textLimits.disk}>{bytesToString(stats.disk)}</Limit>
            </StatBlock>
            <StatBlock icon={faCloudDownloadAlt} title={'网络(入站)'}>
                {status === 'offline' ? <span className={'text-gray-400'}>离线</span> : bytesToString(stats.rx)}
            </StatBlock>
            <StatBlock icon={faCloudUploadAlt} title={'网络(出站)'}>
                {status === 'offline' ? <span className={'text-gray-400'}>离线</span> : bytesToString(stats.tx)}
            </StatBlock>
            <StatBlock icon={faCalendarAlt} title={'到期时间'} color={dueColor}>
                {dueLoading ? (
                    '--'
                ) : due?.next_due ? (
                    <>
                        {dueLabel(due.next_due)}
                        <span className={'ml-1 text-gray-300 text-[70%] select-none'}>/ {due.next_due}</span>
                    </>
                ) : (
                    '非付费用户'
                )}
            </StatBlock>
        </div>
    );
};

export default ServerDetailsBlock;
