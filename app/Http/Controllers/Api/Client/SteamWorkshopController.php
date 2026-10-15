<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * Steam 创意工坊模组代理接口（模组安装功能）。
 *
 * 设计要点：
 *  - 搜索必须带 Web API key，key 只存在于后端（config pterodactyl.steam_api_key），
 *    前端不可见；Steam API 无 CORS，因此前端一律通过本端点中转。
 *  - 游戏模式由前端按 EGG_CAPABILITIES 侦测（PAL/DST）后传入，本控制器内部
 *    维护 appid 白名单映射，不向浏览器暴露 appid。
 *  - 端点挂在 /api/client 下，继承面板客户端认证；路由另叠加 throttle:steam.search
 *    限流（每用户每分钟 30 次），叠加在全局 api.client 限流之上。
 *  - 返回字段裁剪为卡片所需最小集，short_description 截断，preview_url 保留末尾斜杠
 *    （Steam CDN 实测去掉末尾斜杠返回 404）。
 */
class SteamWorkshopController extends ClientApiController
{
    /**
     * 支持的 game 模式 -> Steam appid 白名单。
     * PAL = 幻兽帕鲁 1623730；DST = 饥荒联机版 322330。
     * 新增游戏只需在此追加一行，前端无需感知 appid。
     */
    private const APPID_MAP = [
        'pal' => 1623730,
        'dst' => 322330,
    ];

    private const PER_PAGE = 9; // 一行三个 × 三行正好填满，不超过"一页最多 10 个"

    private const MAX_Q_LEN = 100;
    private const MAX_PAGE = 1000;

    /**
     * 搜索创意工坊模组。
     *
     * GET /api/client/mods/steam/search?mode=pal&q=ue4ss&page=1
     *
     * @return JsonResponse
     */
    public function search(Request $request): JsonResponse
    {
        $mode = strtolower(trim((string) $request->query('mode', '')));
        if (!isset(self::APPID_MAP[$mode])) {
            return new JsonResponse(['error' => 'unsupported game mode'], 422);
        }

        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) > self::MAX_Q_LEN) {
            return new JsonResponse(['error' => 'search query too long'], 422);
        }

        $page = max(1, (int) $request->query('page', 1));
        if ($page > self::MAX_PAGE) {
            $page = self::MAX_PAGE;
        }

        $key = (string) config('pterodactyl.steam_api_key', '');
        if ($key === '') {
            return new JsonResponse(['error' => 'steam api key not configured'], 503);
        }

        $params = [
            'key' => $key,
            'querytype' => 0,
            'page' => $page,
            'numperpage' => self::PER_PAGE,
            'appid' => self::APPID_MAP[$mode],
            'return_details' => true,
            'return_short_description' => true,
            'language' => 'schinese',
        ];
        if ($q !== '') {
            $params['search_text'] = $q;
        }

        try {
            $resp = Http::connectTimeout(10)
                ->timeout(20)
                ->withUserAgent('MLSG-Panel/1.0')
                ->get('https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/', $params);

            if (!$resp->successful()) {
                return new JsonResponse(['error' => 'steam api request failed', 'status' => $resp->status()], 502);
            }

            $data = $resp->json();
            $response = $data['response'] ?? [];
            $items = $response['publishedfiledetails'] ?? [];

            $out = [];
            foreach ($items as $it) {
                $out[] = [
                    'id' => (string) ($it['publishedfileid'] ?? ''),
                    'title' => (string) ($it['title'] ?? ''),
                    'preview_url' => (string) ($it['preview_url'] ?? ''),
                    'short_description' => mb_substr((string) ($it['short_description'] ?? ''), 0, 140),
                    'subscriptions' => (int) ($it['subscriptions'] ?? 0),
                    'time_updated' => (int) ($it['time_updated'] ?? 0),
                ];
            }

            return new JsonResponse([
                'items' => $out,
                'total' => (int) ($response['total'] ?? 0),
                'page' => $page,
                'pages' => (int) ceil(((int) ($response['total'] ?? 0)) / self::PER_PAGE),
                'mode' => $mode,
            ], 200);
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'steam api unreachable', 'detail' => $e->getMessage()], 502);
        }
    }
}
