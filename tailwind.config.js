const colors = require('tailwindcss/colors');

// A 夜间配色 —— 蓝黑色阶（兼顾日夜）
const gray = {
    50: 'hsl(217, 30%, 96%)',    // 高对比浅底
    100: 'hsl(218, 35%, 93%)',   // 主文字
    200: 'hsl(219, 30%, 84%)',   // 次级浅文字
    300: 'hsl(220, 24%, 72%)',   // 弱文字
    400: 'hsl(220, 15%, 62%)',   // 次级文字
    500: 'hsl(221, 22%, 46%)',   // 中性/禁用
    600: 'hsl(222, 28%, 26%)',   // 边框/分隔线
    700: 'hsl(222, 32%, 16%)',   // 侧边栏
    800: 'hsl(224, 35%, 11%)',   // 页面主背景
    900: 'hsl(226, 40%, 8%)',    // 顶部栏/深底
};

// 品牌蓝 —— primary / blue / cyan 统一
const brandBlue = {
    50: 'hsl(221, 100%, 97%)',   // 主按钮文字反色
    100: 'hsl(221, 90%, 93%)',
    200: 'hsl(221, 85%, 85%)',
    300: 'hsl(221, 80%, 72%)',
    400: 'hsl(221, 82%, 63%)',
    500: 'hsl(221, 83%, 55%)',   // 主色
    600: 'hsl(221, 83%, 47%)',   // hover / 边框
    700: 'hsl(221, 83%, 40%)',   // hover 深
    800: 'hsl(221, 85%, 32%)',
    900: 'hsl(222, 86%, 25%)',
};

module.exports = {
    content: [
        './resources/scripts/**/*.{js,ts,tsx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                header: ['"IBM Plex Sans"', '"Roboto"', 'system-ui', 'sans-serif'],
            },
            colors: {
                black: '#131a20',
                // "primary" and "neutral" are deprecated, prefer the use of "blue" and "gray"
                // in new code.
                primary: brandBlue,
                blue: brandBlue,
                gray: gray,
                neutral: gray,
                cyan: brandBlue,
            },
            fontSize: {
                '2xs': '0.625rem',
            },
            transitionDuration: {
                250: '250ms',
            },
            borderColor: theme => ({
                default: theme('colors.neutral.400', 'currentColor'),
            }),
        },
    },
    plugins: [
        require('@tailwindcss/line-clamp'),
        require('@tailwindcss/forms')({
            strategy: 'class',
        }),
    ]
};
