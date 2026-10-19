import http from '@/api/http';

export interface ServerDueDate {
    id: number;
    next_due: string | null;
    status: string | null;
    billing_cycle: string | null;
    dedicated_ip: string | null;
}

export default (uuid: string): Promise<ServerDueDate | null> => {
    return new Promise((resolve, reject) => {
        http.get(`/api/client/servers/${uuid}/due`)
            .then(({ data }) => resolve(data.data))
            .catch(reject);
    });
};
