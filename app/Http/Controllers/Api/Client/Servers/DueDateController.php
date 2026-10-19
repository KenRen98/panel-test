<?php

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Request;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\Server;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;

class DueDateController extends ClientApiController
{
    /**
     * 返回服务器在 WHMCS 侧的到期时间。
     *
     * 链路：server.external_id（= WHMCS tblhosting.id）→ 内部 due API → nextduedate。
     * 无 external_id（手动创建的测试服）或 due API 不可用时返回 data: null，前端静默降级。
     */
    public function index(Request $request, Server $server): array
    {
        $externalId = $server->external_id;
        if (!$externalId) {
            return ['data' => null];
        }

        // 内部服务，固定 hardcode（面板跑在 Docker 内，用 host.docker.internal 访问宿主机上的 due API）
        $baseUrl = 'http://host.docker.internal:9999';
        $apiKey = 'gtZCxEVozWHqS7xascNi0zRjFsRtParo';

        try {
            $response = Http::withHeaders(['X-API-Key' => $apiKey])
                ->timeout(5)
                ->get($baseUrl . '/api/due/' . $externalId);
        } catch (ConnectionException $e) {
            return ['data' => null];
        }

        if ($response->status() !== 200) {
            return ['data' => null];
        }

        return ['data' => $response->json('data')];
    }
}
