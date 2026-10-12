<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\Base;
use Pterodactyl\Http\Middleware\RequireTwoFactorAuthentication;

Route::get('/', [Base\IndexController::class, 'index'])->name('index')->fallback();
Route::get('/account', [Base\IndexController::class, 'index'])
    ->withoutMiddleware(RequireTwoFactorAuthentication::class)
    ->name('account');

Route::get('/locales/locale.json', Base\LocaleController::class)
    ->withoutMiddleware(['auth', RequireTwoFactorAuthentication::class])
    ->where('namespace', '.*');

// 内部触发端点：宿主机 update.sh 拉取 metadata 后调用，同步 GUOCHAN_PACK_ID 的 rules。
// 不经过 session 认证，改由控制器内校验 token（config pterodactyl.modpacks_sync_token）。
Route::get('/internal/modpacks/sync-egg', [Base\ModpackSyncController::class, 'sync'])
    ->withoutMiddleware(['auth.session', RequireTwoFactorAuthentication::class]);

Route::get('/{react}', [Base\IndexController::class, 'index'])
    ->where('react', '^(?!(\/)?(api|auth|admin|daemon)).+');
