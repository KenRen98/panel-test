<?php

namespace Pterodactyl\Http\Controllers\Base;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Pterodactyl\Services\Modpacks\ModpackEggSyncService;

/**
 * 内部触发端点：宿主机 update.sh 在拉取 metadata 后调用本端点，
 * 同步更新数据库里 GUOCHAN_PACK_ID 变量的 rules。
 *
 * 受 token 保护（config pterodactyl.modpacks_sync_token，默认关闭）。
 * 不经过 session 认证，token 校验在本控制器内完成。
 */
class ModpackSyncController
{
    public function __construct(private ModpackEggSyncService $syncService)
    {
    }

    public function sync(Request $request): JsonResponse
    {
        $expected = (string) config('pterodactyl.modpacks_sync_token', '');

        // 未配置 token 时默认禁用该端点，防止被滥用。
        if ($expected === '' || !hash_equals($expected, (string) $request->query('token', ''))) {
            return new JsonResponse(['error' => 'unauthorized'], 401);
        }

        return new JsonResponse($this->syncService->sync(), 200);
    }
}
