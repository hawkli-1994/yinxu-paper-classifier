import type { ThemeConfig } from 'antd';

export const academicTheme: ThemeConfig = {
  cssVar: { key: 'yinxu' },
  token: {
    colorPrimary: '#2F4A5A',
    colorBgLayout: '#F4F1EA',
    colorBgContainer: '#FFFDFC',
    colorText: '#20262D',
    colorTextSecondary: '#5F6872',
    colorBorder: '#D7D1C5',
    colorSuccess: '#55735B',
    colorWarning: '#A56A2A',
    colorError: '#A13D3D',
    borderRadius: 6,
    fontSize: 14,
    controlHeight: 34
  },
  components: {
    Layout: { siderBg: '#263E4C', headerBg: '#FFFDFC' },
    Menu: { darkItemBg: '#263E4C', darkItemSelectedBg: '#385A6A' },
    Table: { headerBg: '#F1EEE7' }
  }
};
