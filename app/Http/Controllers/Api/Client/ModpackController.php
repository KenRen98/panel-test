<?php

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\File;

/**
 * 模组包元数据接口。
 *
 * 数据源：宿主机挂载进容器的 modpacks.json（目录 /app/storage/modpacks/）。
 * 该 JSON 由宿主机 cron 从 GitHub 拉取更新（见部署说明），面板不再让浏览器
 * 直连 GitHub raw，避免外网依赖与 CORS 问题。
 *
 * 返回时把每个包的 logo_url 改写为面板本地相对路径（/modpacks/logos/<id>.*），
 * 图标同样由宿主机同步到挂载目录，走面板域名加载。
 */
class ModpackController extends ClientApiController
{
    /**
     * 挂载的根目录。
     */
    private function basePath(): string
    {
        return rtrim((string) config('pterodactyl.modpacks_path', '/app/storage/modpacks'), '/');
    }

    /**
     * 返回所有模组包（含激活与未激活，由前端按 is_active 过滤）。
     */
    public function index(): JsonResponse
    {
        $base = $this->basePath();
        $path = $base . '/modpacks.json';

        if (!File::exists($path)) {
            return new JsonResponse(['modpacks' => [], 'error' => 'modpacks metadata not found'], 200);
        }

        try {
            $data = json_decode(File::get($path), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $e) {
            return new JsonResponse(['modpacks' => [], 'error' => 'invalid metadata json'], 200);
        }

        $packs = is_array($data) && isset($data['modpacks']) && is_array($data['modpacks'])
            ? $data['modpacks']
            : [];

        $logosDir = $base . '/logos';
        foreach ($packs as &$pack) {
            // 把外链 logo 改写为面板本地相对路径。图标由宿主机按原始文件名保存
            // （如 the-fool.webp / AFoP.webp），这里取原始 logo_url 的文件名在挂载目录
            // 中匹配实际存在的文件（webp/png 均可）。
            $originalUrl = $pack['logo_url'] ?? '';
            $originalName = basename((string) parse_url($originalUrl, PHP_URL_PATH));

            if ($originalName === '') {
                $pack['logo_url'] = null;
                continue;
            }

            $matched = File::glob($logosDir . '/' . $originalName);
            if (!empty($matched)) {
                $pack['logo_url'] = '/modpacks/logos/' . basename($matched[0]);
            } else {
                $pack['logo_url'] = null;
            }
        }
        unset($pack);

        return new JsonResponse(['modpacks' => $packs], 200);
    }
}
