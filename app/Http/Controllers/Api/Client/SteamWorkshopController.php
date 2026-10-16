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

    private const PER_PAGE = 12; // 3 列=3×4、4 列=4×3 均正好填满，无孤儿卡；12 ≤ 一页上限

    private const MAX_Q_LEN = 100;
    private const MAX_PAGE = 1000;
    private const MAX_DETAIL_IDS = 100; // GetDetails 单次批量上限（保守值）

    /**
     * 把 Steam publishedfiledetails 条目裁剪为前端卡片最小集。
     * QueryFiles 与 GetDetails 返回的 publishedfiledetails 结构同构，共用此映射。
     */
    private function mapDetail(array $it): array
    {
        return [
            'id' => (string) ($it['publishedfileid'] ?? ''),
            'title' => (string) ($it['title'] ?? ''),
            'preview_url' => (string) ($it['preview_url'] ?? ''),
            'short_description' => mb_substr((string) ($it['short_description'] ?? ''), 0, 140),
            'subscriptions' => (int) ($it['subscriptions'] ?? 0),
            'time_updated' => (int) ($it['time_updated'] ?? 0),
        ];
    }

    /**
     * 搜索创意工坊模组。
     *
     * GET /api/client/mods/steam/search?mode=pal&q=ue4ss&page=1
     *
     * 注意：QueryFiles 的 search_text 是标题+描述全文搜索——纯数字 workshop id
     * 会被命中"描述里恰好含该数字"的无关模组。因此当 q 为纯数字（疑似 workshop id）
     * 时改走 IPublishedFileService/GetDetails/v1/ 按 publishedfileid 精确查询。
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

        // 纯数字 → 疑似 workshop id → GetDetails 精确查询（不走全文搜索）
        $byId = $q !== '' && preg_match('/^\d{5,}$/', $q);

        try {
            if ($byId) {
                $resp = $this->getDetails($key, self::APPID_MAP[$mode], [(int) $q]);
                $items = $resp['publishedfiledetails'] ?? [];
                return new JsonResponse([
                    'items' => array_map([$this, 'mapDetail'], $items),
                    'total' => count($items),
                    'page' => 1,
                    'pages' => count($items) > 0 ? 1 : 0,
                    'mode' => $mode,
                    'by_id' => true,
                ], 200);
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

            return new JsonResponse([
                'items' => array_map([$this, 'mapDetail'], $items),
                'total' => (int) ($response['total'] ?? 0),
                'page' => $page,
                'pages' => (int) ceil(((int) ($response['total'] ?? 0)) / self::PER_PAGE),
                'mode' => $mode,
                'by_id' => false,
            ], 200);
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'steam api unreachable', 'detail' => $e->getMessage()], 502);
        }
    }

    /**
     * 已安装模组批量详情（模组管理页）。
     *
     * POST /api/client/mods/steam/details   body: { mode, ids: string[] }
     * 一次 GetDetails 取回全部 id 的元信息（title/preview_url/short_description/
     * subscriptions/time_updated），前端卡片展示完全不用解码服务器本地文件。
     *
     * @return JsonResponse
     */
    public function details(Request $request): JsonResponse
    {
        $mode = strtolower(trim((string) $request->input('mode', '')));
        if (!isset(self::APPID_MAP[$mode])) {
            return new JsonResponse(['error' => 'unsupported game mode'], 422);
        }

        $ids = $request->input('ids');
        if (!is_array($ids)) {
            return new JsonResponse(['error' => 'ids must be an array'], 422);
        }
        $ids = array_values(array_filter(array_map('trim', $ids), fn ($v) => preg_match('/^\d{5,}$/', (string) $v)));
        $ids = array_slice($ids, 0, self::MAX_DETAIL_IDS);
        if (count($ids) === 0) {
            return new JsonResponse(['items' => [], 'mode' => $mode], 200);
        }

        $key = (string) config('pterodactyl.steam_api_key', '');
        if ($key === '') {
            return new JsonResponse(['error' => 'steam api key not configured'], 503);
        }

        try {
            $resp = $this->getDetails($key, self::APPID_MAP[$mode], array_map('intval', $ids));
            $items = $resp['publishedfiledetails'] ?? [];
            return new JsonResponse([
                'items' => array_map([$this, 'mapDetail'], $items),
                'mode' => $mode,
            ], 200);
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'steam api unreachable', 'detail' => $e->getMessage()], 502);
        }
    }

    /**
     * 调 IPublishedFileService/GetDetails/v1/ 批量取详情。
     * 返回完整响应数组（response.publishedfiledetails 由调用方取）。
     *
     * @param int[] $publishedfileids
     */
    private function getDetails(string $key, int $appid, array $publishedfileids): array
    {
        $params = [
            'key' => $key,
            'appid' => $appid,
            'language' => 'schinese',
            'short_description' => true,
            'strip_description_bbcode' => true,
        ];
        foreach ($publishedfileids as $i => $pid) {
            $params['publishedfileids[' . $i . ']'] = $pid;
        }

        $resp = Http::connectTimeout(10)
            ->timeout(20)
            ->withUserAgent('MLSG-Panel/1.0')
            ->get('https://api.steampowered.com/IPublishedFileService/GetDetails/v1/', $params);

        if (!$resp->successful()) {
            throw new \RuntimeException('steam api request failed: ' . $resp->status());
        }
        return $resp->json()['response'] ?? [];
    }
}
