const colors = require('tailwindcss/colors');

// B 品牌深蓝配色 —— 深蓝主题（底色略提亮，避免压抑）
const gray = {
    50: 'hsl(214, 40%, 96%)',    // 高对比浅底
    100: 'hsl(218, 33%, 93%)',   // 主文字
    200: 'hsl(219, 28%, 86%)',   // 次级浅文字
    300: 'hsl(220, 22%, 74%)',   // 弱文字
    400: 'hsl(220, 16%, 58%)',   // 次级文字
    500: 'hsl(221, 22%, 46%)',   // 中性/禁用
    600: 'hsl(220, 22%, 33%)',   // 边框/分隔线
    700: 'hsl(221, 28%, 28%)',   // 侧边栏
    800: 'hsl(222, 30%, 24%)',   // 页面主背景
    900: 'hsl(224, 34%, 17%)',   // 顶部栏/深底
};

// 品牌蓝 —— primary / blue / cyan 统一
const brandBlue = {
    50: 'hsl(214, 100%, 97%)',   // 主按钮文字反色
    100: 'hsl(217, 91%, 92%)',
    200: 'hsl(217, 90%, 84%)',
    300: 'hsl(217, 88%, 72%)',
    400: 'hsl(217, 90%, 66%)',
    500: 'hsl(217, 91%, 60%)',   // 主色
    600: 'hsl(221, 83%, 53%)',   // hover / 边框
    700: 'hsl(221, 82%, 46%)',   // hover 深
    800: 'hsl(222, 82%, 38%)',
    900: 'hsl(223, 84%, 30%)',
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
