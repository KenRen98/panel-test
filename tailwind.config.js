const colors = require('tailwindcss/colors');

// MLSG 官网蓝白色系（https://mlsg.mr-leaves.com）
// 尺度语义与官方深色主题相反：900 = 最浅（页面背景），100 = 最深（正文文字）
// 深色主题下 900 是深色底、100 是浅色字；反转后 900 是浅色底、100 是深色字
const gray = {
    50: '#0A101E',
    100: '#121833',
    200: '#2D3C58',
    300: '#4C5671',
    400: '#6B7A99',
    500: '#8DA6C9',
    600: '#B9CBF0',
    700: '#D4DCFF',
    800: '#FFFFFF',
    900: '#F4F9FF',
};

// 品牌蓝（#0774FF）色阶
const blue = {
    50: '#EAF1FF',
    100: '#D8EAFF',
    200: '#C3DFFF',
    300: '#99C9FF',
    400: '#4DA2FF',
    500: '#0774FF',
    600: '#0755F0',
    700: '#0445C5',
    800: '#033AA7',
    900: '#013396',
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
                primary: blue,
                gray: gray,
                neutral: gray,
                cyan: {
                    ...colors.cyan,
                    // 顶栏激活下划线用品牌蓝（其余 cyan 保留给控制台图表数据色）
                    600: '#0755F0',
                },
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
