<?php

namespace Pterodactyl\Console\Commands\Overrides;

use Illuminate\Console\Command;
use Pterodactyl\Services\Modpacks\ModpackEggSyncService;

/**
 * 根据挂载目录的 modpacks.json 重新生成并完全覆盖 GUOCHAN_PACK_ID 变量的 rules。
 *
 * 用法：
 *   php artisan modpacks:sync-egg
 *
 * 逻辑：
 *   - 读取 modpacks_path（默认 /app/storage/modpacks/modpacks.json）
 *   - 对每个 is_active=true 的包，按 "({id}) {name}-{version}" 生成允许值
 *   - 保留开头的 "(1000) 未启用"
 *   - 完全覆盖 egg_variables 表中 env_variable = 'GUOCHAN_PACK_ID' 的 rules 字段
 *
 * 该命令由宿主机 update.sh 通过内部触发路由间接调用。
 */
class ModpackSyncEggCommand extends Command
{
    protected $signature = 'modpacks:sync-egg';

    protected $description = '根据本地 modpacks.json 重新生成并覆盖 GUOCHAN_PACK_ID 变量的 rules';

    public function __construct(private ModpackEggSyncService $syncService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $result = $this->syncService->sync();

        if (($result['status'] ?? '') !== 'ok') {
            $this->error($result['error'] ?? 'sync failed');

            return self::FAILURE;
        }

        $this->info('已更新 GUOCHAN_PACK_ID rules，共 ' . $result['count'] . ' 个整合包（含 未启用）。');

        return self::SUCCESS;
    }
}
