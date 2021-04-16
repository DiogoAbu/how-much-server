export type Theme = {
  bodyBgColor: string;

  textColor: string;
  textColorFaded: string;
  linkTextColor: string;

  panelBgColor: string;
  panelBorderColor: string;

  buttonBgColor: string;
  buttonTextColor: string;
};

export type GenerateArgs = {
  code: number;
  expireHours: number;
  theme: Theme;
};

const whiteBlue: Theme = {
  bodyBgColor: '#e9ecef',

  textColor: '#000',
  textColorFaded: '#666',
  linkTextColor: '#1a82e2',

  panelBgColor: '#ffffff',
  panelBorderColor: '#d4dadf',

  buttonBgColor: '#2980b9',
  buttonTextColor: '#ffffff',
};

export default {
  whiteBlue,
};
