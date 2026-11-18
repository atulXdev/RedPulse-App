// src/app/(auth)/index.tsx
// Direct Email & Password Sign In / Sign Up (no verification email needed)
// with an optional 6-digit OTP code fallback.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type TextInput,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { supabase } from '@/utils/supabase';
import { useAuthStore } from '@/stores/authStore';
import { emailSchema, otpSchema } from '@/schemas';
import { useToast } from '@/stores/toastStore';
import { useAppTheme } from '@/stores/themeStore';
import { errorReporter } from '@/lib/errorReporter';
import {
  FontSize,
  FontWeight,
  LetterSpacing,
  Spacing,
  Radius,
  Elevation,
} from '@/constants/Typography';
import { BrandMark, Button, Input, Text } from '@/ui';

type AuthMode = 'signin' | 'signup' | 'otp_request' | 'otp_verify';

function firstIssue(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

export default function LoginScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Errors
  const [nameError, setNameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [otpError, setOtpError] = useState<string | undefined>();

  const otpRef = useRef<React.ElementRef<typeof TextInput>>(null);

  // Sheet entrance + gentle brand breath
  const ty = useSharedValue(reduceMotion ? 0 : 60);
  const op = useSharedValue(reduceMotion ? 1 : 0);
  const breath = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    ty.value = withSpring(0, { damping: 16, stiffness: 180, mass: 0.6 });
    op.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) });
    breath.value = withRepeat(
      withTiming(1.03, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [reduceMotion, ty, op, breath]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
    opacity: op.value,
  }));
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  const validateFields = (forMode: 'signin' | 'signup') => {
    let hasErr = false;
    const cleanEmail = email.trim().toLowerCase();
    const emailErr = firstIssue(emailSchema.safeParse({ email: cleanEmail }));
    if (emailErr) {
      setEmailError(emailErr);
      hasErr = true;
    } else {
      setEmailError(undefined);
    }

    if (forMode === 'signup') {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setNameError('Please enter your full name (at least 2 letters)');
        hasErr = true;
      } else {
        setNameError(undefined);
      }
    }

    if (!password || password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      hasErr = true;
    } else {
      setPasswordError(undefined);
    }

    return !hasErr;
  };

  /* ── 1. Sign In with Password ────────────────────────────────────────── */
  const handleSignIn = useCallback(async () => {
    if (!validateFields('signin')) return;
    setLoading(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const cleanEmail = email.trim().toLowerCase();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) throw error;

      if (data.user) {
        await useAuthStore.getState().refreshProfile();
        toast.success('Signed in', { description: `Welcome back!` });
      }
    } catch (e) {
      errorReporter.error(e, { screen: 'auth/signin' });
      const msg = e instanceof Error ? e.message : 'Invalid email or password';
      setPasswordError(msg);
      toast.error('Sign in failed', { description: msg });
    } finally {
      setLoading(false);
    }
  }, [email, password, toast]);

  /* ── 2. Sign Up with Email, Password & Name ──────────────────────────── */
  const handleSignUp = useCallback(async () => {
    if (!validateFields('signup')) return;
    setLoading(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();
    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
          },
        },
      });
      if (error) throw error;

      if (data.user) {
        // Upsert full_name into profiles table
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: cleanEmail,
          full_name: cleanName,
        });
        await useAuthStore.getState().refreshProfile();
        toast.success('Account created', { description: `Welcome to RedPulse, ${cleanName}!` });
        router.replace('/onboarding');
      }
    } catch (e) {
      errorReporter.error(e, { screen: 'auth/signup' });
      const msg = e instanceof Error ? e.message : 'Could not create account';
      toast.error('Registration failed', { description: msg });
    } finally {
      setLoading(false);
    }
  }, [email, fullName, password, toast, router]);

  /* ── 3. Send 6-digit OTP (fallback) ──────────────────────────────────── */
  const sendOtp = useCallback(async () => {
    const clean = email.trim().toLowerCase();
    const err = firstIssue(emailSchema.safeParse({ email: clean }));
    if (err) {
      setEmailError(err);
      return;
    }
    setEmailError(undefined);
    setLoading(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: clean,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setMode('otp_verify');
      setOtp('');
      setTimeout(() => otpRef.current?.focus(), 240);
      toast.info('Code sent', { description: `Check ${clean}` });
    } catch (e) {
      errorReporter.error(e, { screen: 'auth/otp_send' });
      toast.error("Couldn't send code", {
        description: e instanceof Error ? e.message : 'Try again in a moment',
      });
    } finally {
      setLoading(false);
    }
  }, [email, toast]);

  /* ── 4. Verify OTP ───────────────────────────────────────────────────── */
  const verifyOtp = useCallback(async () => {
    const code = otp.trim();
    const err = firstIssue(otpSchema.safeParse({ code }));
    if (err) {
      setOtpError(err);
      return;
    }
    setOtpError(undefined);
    setLoading(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code,
        type: 'email',
      });
      if (error) throw error;
      await useAuthStore.getState().refreshProfile();
    } catch (e) {
      errorReporter.error(e, { screen: 'auth/otp_verify' });
      setOtpError('That code is invalid or expired');
      toast.error("Code didn't match", { description: 'Double-check it or send a new one' });
    } finally {
      setLoading(false);
    }
  }, [email, otp, toast]);

  const heroHeight = Math.max(200, Math.round(height * 0.32));
  const isOtp = mode === 'otp_request' || mode === 'otp_verify';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <View style={[styles.hero, { height: heroHeight, paddingTop: insets.top + Spacing[2], paddingBottom: Spacing[3] }]}>
        <View style={{ alignItems: 'center', gap: Spacing[2] }}>
          <Animated.View style={breathStyle}>
            <BrandMark size={56} />
          </Animated.View>
          <Text
            style={{
              fontSize: FontSize.sm,
              fontWeight: FontWeight.black,
              letterSpacing: LetterSpacing.widest,
            }}
          >
            REDPULSE
          </Text>
          <Text variant="bodySm" tone="muted">
            The fastest way to find a blood donor
          </Text>
        </View>
      </View>

      {/* ── SHEET ─────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: theme.surface, borderTopColor: theme.border },
          Elevation.lg,
          sheetStyle,
        ]}
      >
        <View style={styles.sheetTop}>
          <View style={[styles.accentStrip, { backgroundColor: theme.primary }]} />
          <View style={[styles.handle, { backgroundColor: theme.borderStrong }]} />
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: Spacing[5],
            paddingBottom: insets.bottom + Spacing[8],
            gap: Spacing[3],
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Tabs: Sign In / Create Account */}
          {!isOtp ? (
            <View style={[styles.tabContainer, { backgroundColor: theme.background }]}>
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMode('signin');
                  setNameError(undefined);
                  setEmailError(undefined);
                  setPasswordError(undefined);
                }}
                style={[
                  styles.tabBtn,
                  mode === 'signin' && {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text
                  variant="label"
                  style={{
                    color: mode === 'signin' ? theme.primary : theme.textTertiary,
                    fontWeight: mode === 'signin' ? FontWeight.bold : FontWeight.medium,
                  }}
                >
                  Sign In
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMode('signup');
                  setNameError(undefined);
                  setEmailError(undefined);
                  setPasswordError(undefined);
                }}
                style={[
                  styles.tabBtn,
                  mode === 'signup' && {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text
                  variant="label"
                  style={{
                    color: mode === 'signup' ? theme.primary : theme.textTertiary,
                    fontWeight: mode === 'signup' ? FontWeight.bold : FontWeight.medium,
                  }}
                >
                  Create Account
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: Spacing[2], marginBottom: Spacing[1] }}>
              <View style={{ flex: 1, height: 3, borderRadius: Radius.pill, backgroundColor: theme.primary }} />
              <View
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: Radius.pill,
                  backgroundColor: mode === 'otp_verify' ? theme.primary : theme.border,
                }}
              />
            </View>
          )}

          {/* Form Content */}
          {mode === 'signin' && (
            <>
              <Text variant="headline">Welcome back</Text>
              <Text variant="body" tone="muted">
                Enter your email and password to sign in.
              </Text>

              <Input
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (emailError) setEmailError(undefined);
                }}
                error={emailError}
                leftIcon="mail-outline"
              />

              <Input
                label="Password"
                placeholder="Enter password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                returnKeyType="done"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (passwordError) setPasswordError(undefined);
                }}
                onSubmitEditing={handleSignIn}
                error={passwordError}
                leftIcon="lock-closed-outline"
                rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onRightIconPress={() => setShowPassword((v) => !v)}
              />

              <Button
                label="Sign In"
                onPress={handleSignIn}
                loading={loading}
                loadingLabel="Signing in..."
                fullWidth
                size="xl"
                icon="log-in-outline"
              />
            </>
          )}

          {mode === 'signup' && (
            <>
              <Text variant="headline">Create your account</Text>
              <Text variant="body" tone="muted">
                Join our network of lifesaving donors and recipients.
              </Text>

              <Input
                label="Full Name"
                placeholder="e.g. Rahul Sharma"
                autoCapitalize="words"
                autoCorrect={false}
                value={fullName}
                onChangeText={(t) => {
                  setFullName(t);
                  if (nameError) setNameError(undefined);
                }}
                error={nameError}
                leftIcon="person-outline"
              />

              <Input
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (emailError) setEmailError(undefined);
                }}
                error={emailError}
                leftIcon="mail-outline"
              />

              <Input
                label="Password"
                placeholder="Create password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="done"
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (passwordError) setPasswordError(undefined);
                }}
                onSubmitEditing={handleSignUp}
                error={passwordError}
                helper="At least 6 characters"
                leftIcon="lock-closed-outline"
                rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onRightIconPress={() => setShowPassword((v) => !v)}
              />

              <Button
                label="Create Account"
                onPress={handleSignUp}
                loading={loading}
                loadingLabel="Creating account..."
                fullWidth
                size="xl"
                icon="person-add-outline"
              />
            </>
          )}

          {mode === 'otp_request' && (
            <>
              <Text variant="headline">Sign in with OTP</Text>
              <Text variant="body" tone="muted">
                We will email a 6-digit one-time code.
              </Text>

              <Input
                label="Email"
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  if (emailError) setEmailError(undefined);
                }}
                onSubmitEditing={sendOtp}
                error={emailError}
                leftIcon="mail-outline"
                autoFocus
              />

              <Button
                label="Send 6-digit code"
                onPress={sendOtp}
                loading={loading}
                loadingLabel="Sending code..."
                fullWidth
                size="xl"
                icon="send-outline"
              />
            </>
          )}

          {mode === 'otp_verify' && (
            <>
              <Text variant="headline">Check your inbox</Text>
              <Text variant="body" tone="muted">
                Enter the code sent to{' '}
                <Text variant="body" style={{ fontWeight: FontWeight.bold }}>
                  {email.trim().toLowerCase()}
                </Text>
              </Text>

              <Input
                ref={otpRef}
                label="6-digit code"
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={(t) => {
                  setOtp(t.replace(/\D/g, ''));
                  if (otpError) setOtpError(undefined);
                }}
                onSubmitEditing={verifyOtp}
                error={otpError}
                leftIcon="keypad-outline"
              />

              <Button
                label="Verify and Continue"
                onPress={verifyOtp}
                loading={loading}
                loadingLabel="Verifying..."
                fullWidth
                size="xl"
                icon="shield-checkmark-outline"
              />

              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMode('otp_request');
                }}
                hitSlop={8}
                style={{ alignSelf: 'center', marginTop: Spacing[1] }}
              >
                <Text variant="label" tone="secondary">
                  Different email
                </Text>
              </Pressable>
            </>
          )}

          {/* Toggle between Password and OTP */}
          <View style={{ alignItems: 'center', marginTop: Spacing[2] }}>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                if (isOtp) {
                  setMode('signin');
                } else {
                  setMode('otp_request');
                }
              }}
              hitSlop={8}
            >
              <Text variant="label" tone="primary">
                {isOtp ? '← Back to password sign in' : 'Or sign in with email OTP code →'}
              </Text>
            </Pressable>
          </View>

          <Text
            variant="caption"
            tone="tertiary"
            style={{
              textAlign: 'center',
              paddingHorizontal: Spacing[4],
              lineHeight: FontSize.xs * 1.5,
              marginTop: Spacing[1],
            }}
          >
            By continuing you agree to our Terms and acknowledge our Privacy Policy.
          </Text>
        </ScrollView>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { alignItems: 'center', justifyContent: 'center' },
  sheet: {
    flex: 1,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderCurve: 'continuous',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetTop: { alignItems: 'center', paddingTop: Spacing[2], paddingBottom: Spacing[2] },
  accentStrip: { width: 36, height: 3, borderRadius: 2, marginBottom: Spacing[1], opacity: 0.9 },
  handle: { width: 44, height: 4, borderRadius: 2 },
  tabContainer: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    marginBottom: Spacing[2],
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing[2],
    alignItems: 'center',
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
});
