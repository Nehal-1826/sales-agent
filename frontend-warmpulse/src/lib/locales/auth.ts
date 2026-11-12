/** Auth-page strings (Login, Signup, 2FA modal). Auto-merged by lib/i18n. */
export const en: Record<string, string> = {
  // Login headings / subheadings
  'auth.login.heading': 'Welcome back',
  'auth.login.subheadingNormal': 'Log in to monitor your warmup reputation.',
  'auth.login.subheadingTotp': 'Enter the 6-digit code from your authenticator app.',

  // Login Google button
  'auth.login.googleSigningIn': 'Signing in…',
  'auth.login.googleButton': 'Log in with Google',

  // Login footer
  'auth.login.noAccount': 'No account?',
  'auth.login.signupLink': 'Sign up',

  // Login form fields
  'auth.login.emailLabel': 'Email',
  'auth.login.passwordLabel': 'Password',
  'auth.login.forgotPassword': 'Forgot password?',

  // Login submit button
  'auth.login.signingIn': 'Signing in…',
  'auth.login.signIn': 'Sign in',

  // Login client-side error / toast messages
  'auth.login.totpValidation': 'Enter the 6-digit code from your authenticator app',
  'auth.login.incorrectCredentials': 'Incorrect email or password.',
  'auth.login.accessDenied': 'Access denied for this account.',
  'auth.login.signInFailed': 'Sign-in failed. Please try again.',
  'auth.login.twoFactorRequired': 'Two-factor authentication required',
  'auth.login.signedIn': 'Signed in',
  'auth.login.googleSignInFailed': 'Google sign-in failed',

  // Signup headings / subheadings
  'auth.signup.heading': 'Create your account',
  'auth.signup.subheading': 'Start warming up your inbox in minutes.',

  // Signup Google button
  'auth.signup.googleSigningIn': 'Signing in…',
  'auth.signup.googleButton': 'Continue with Google',

  // Signup footer
  'auth.signup.alreadyHaveAccount': 'Already have an account?',
  'auth.signup.loginLink': 'Log in',

  // Signup plan banner
  'auth.signup.planPreselected': 'Plan preselected:',

  // Signup form fields
  'auth.signup.workEmailLabel': 'Work email',
  'auth.signup.passwordLabel': 'Password',
  'auth.signup.passwordHint': 'At least 8 characters, 1 letter and 1 number.',

  // Signup submit button
  'auth.signup.creatingAccount': 'Creating account…',
  'auth.signup.createAccount': 'Create account',

  // Signup client-side error messages
  'auth.signup.emailAlreadyRegistered': 'That email is already registered. Log in instead?',
  'auth.signup.reviewForm': 'Please review the form and try again.',
  'auth.signup.somethingWrong': 'Something went wrong. Please try again.',
  'auth.signup.googleSignUpFailed': 'Google sign-up failed',

  // TOTP modal
  'auth.totp.title': 'Two-factor authentication',
  'auth.totp.description': 'Two-factor authentication code',
  'auth.totp.body':
    'Enter the 6-digit code from your authenticator app. The code rotates every 30 seconds.',
  'auth.totp.recoveryText':
    'Lost access to your authenticator? Use one of the recovery codes you saved when you enabled 2FA.',
  'auth.totp.cancel': 'Cancel',
  'auth.totp.verifying': 'Verifying…',
  'auth.totp.verify': 'Verify',
};

export const hi: Record<string, string> = {
  // Login headings / subheadings
  'auth.login.heading': 'वापस स्वागत है',
  'auth.login.subheadingNormal': 'अपनी वार्मअप प्रतिष्ठा मॉनिटर करने के लिए लॉग इन करें।',
  'auth.login.subheadingTotp': 'अपने ऑथेंटिकेटर ऐप से 6-अंकीय कोड दर्ज करें।',

  // Login Google button
  'auth.login.googleSigningIn': 'साइन इन हो रहा है…',
  'auth.login.googleButton': 'Google से लॉग इन करें',

  // Login footer
  'auth.login.noAccount': 'खाता नहीं है?',
  'auth.login.signupLink': 'साइन अप करें',

  // Login form fields
  'auth.login.emailLabel': 'ईमेल',
  'auth.login.passwordLabel': 'पासवर्ड',
  'auth.login.forgotPassword': 'पासवर्ड भूल गए?',

  // Login submit button
  'auth.login.signingIn': 'साइन इन हो रहा है…',
  'auth.login.signIn': 'साइन इन करें',

  // Login client-side error / toast messages
  'auth.login.totpValidation': 'अपने ऑथेंटिकेटर ऐप से 6-अंकीय कोड दर्ज करें',
  'auth.login.incorrectCredentials': 'गलत ईमेल या पासवर्ड।',
  'auth.login.accessDenied': 'इस खाते के लिए पहुँच अस्वीकृत।',
  'auth.login.signInFailed': 'साइन इन विफल। कृपया पुनः प्रयास करें।',
  'auth.login.twoFactorRequired': 'दो-कारक प्रमाणीकरण आवश्यक है',
  'auth.login.signedIn': 'साइन इन हो गया',
  'auth.login.googleSignInFailed': 'Google साइन इन विफल',

  // Signup headings / subheadings
  'auth.signup.heading': 'अपना खाता बनाएं',
  'auth.signup.subheading': 'मिनटों में अपना इनबॉक्स वार्मअप शुरू करें।',

  // Signup Google button
  'auth.signup.googleSigningIn': 'साइन इन हो रहा है…',
  'auth.signup.googleButton': 'Google से जारी रखें',

  // Signup footer
  'auth.signup.alreadyHaveAccount': 'पहले से खाता है?',
  'auth.signup.loginLink': 'लॉग इन करें',

  // Signup plan banner
  'auth.signup.planPreselected': 'प्लान पहले से चुना गया:',

  // Signup form fields
  'auth.signup.workEmailLabel': 'कार्य ईमेल',
  'auth.signup.passwordLabel': 'पासवर्ड',
  'auth.signup.passwordHint': 'कम से कम 8 अक्षर, 1 अक्षर और 1 अंक।',

  // Signup submit button
  'auth.signup.creatingAccount': 'खाता बन रहा है…',
  'auth.signup.createAccount': 'खाता बनाएं',

  // Signup client-side error messages
  'auth.signup.emailAlreadyRegistered': 'यह ईमेल पहले से पंजीकृत है। क्या आप लॉग इन करना चाहेंगे?',
  'auth.signup.reviewForm': 'कृपया फ़ॉर्म की समीक्षा करें और पुनः प्रयास करें।',
  'auth.signup.somethingWrong': 'कुछ गलत हुआ। कृपया पुनः प्रयास करें।',
  'auth.signup.googleSignUpFailed': 'Google साइन अप विफल',

  // TOTP modal
  'auth.totp.title': 'दो-कारक प्रमाणीकरण',
  'auth.totp.description': 'दो-कारक प्रमाणीकरण कोड',
  'auth.totp.body':
    'अपने ऑथेंटिकेटर ऐप से 6-अंकीय कोड दर्ज करें। कोड हर 30 सेकंड में बदलता है।',
  'auth.totp.recoveryText':
    'अपने ऑथेंटिकेटर तक पहुँच खो दी? 2FA सक्षम करते समय सहेजे गए रिकवरी कोड में से एक का उपयोग करें।',
  'auth.totp.cancel': 'रद्द करें',
  'auth.totp.verifying': 'सत्यापित हो रहा है…',
  'auth.totp.verify': 'सत्यापित करें',
};
