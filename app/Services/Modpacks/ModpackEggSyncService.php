<?php

namespace Pterodactyl\Services\Modpacks;

use Illuminate\Support\Facades\File;
use Pterodactyl\Models\EggVariable;

/**
 * 模组包 egg 变量同步逻辑。
 *
 * 读取本地挂载的 modpacks.json，重新生成 GUOCHAN_PACK_ID 变量的 rules 并完全覆盖。
 * 供 artisan 命令与内部触发路由共用，避免逻辑重复。
 */
class ModpackEggSyncService
{
    /**
     * @return array{status: string, updated: int, count: int, error?: string}
     */
    public function sync(): array
    {
        $base = rtrim((string) config('pterodactyl.modpacks_path', '/app/storage/modpacks'), '/');
        $path = $base . '/modpacks.json';

        if (!File::exists($path)) {
            return ['status' => 'error', 'updated' => 0, 'count' => 0, 'error' => 'modpacks.json not found'];
        }

        try {
            $data = json_decode(File::get($path), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $e) {
            return ['status' => 'error', 'updated' => 0, 'count' => 0, 'error' => 'invalid modpacks.json'];
        }

        $packs = is_array($data) && isset($data['modpacks']) && is_array($data['modpacks'])
            ? $data['modpacks']
            : [];

        // 保留开头的 "未启用" 选项，再追加所有激活的整合包。
        $allowed = ['(1000) 未启用'];

        foreach ($packs as $pack) {
            if (!isset($pack['id']) || !isset($pack['name'])) {
                continue;
            }

            if (isset($pack['is_active']) && !$pack['is_active']) {
                continue;
            }

            $label = '(' . (int) $pack['id'] . ') ' . $pack['name'];
            if (isset($pack['version']) && $pack['version'] !== '') {
                $label .= '-' . $pack['version'];
            }

            $allowed[] = $label;
        }

        $rules = 'nullable|string|in:' . implode(',', $allowed);

        $variable = EggVariable::query()->where('env_variable', 'GUOCHAN_PACK_ID')->first();

        if (!$variable) {
            return ['status' => 'error', 'updated' => 0, 'count' => 0, 'error' => 'no GUOCHAN_PACK_ID variable found'];
        }

        $variable->rules = $rules;
        $variable->save();

        return [
            'status' => 'ok',
            'updated' => 1,
            'count' => count($allowed) - 1,
        ];
    }
}
