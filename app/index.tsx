// FILE: app/+html.tsx
// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/*
          Disable body scrolling on web to make ScrollView components work correctly.
          If you want to enable scrolling, remove `ScrollViewStyleReset` and
          set `overflow: auto` on the body style below.
        */}
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}


// FILE: app/index.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

type Stage =
  | "splash"
  | "authChoice"
  | "register"
  | "login"
  | "home"
  | "editor"
  | "preview"
  | "library"
  | "player"
  | "ai"
  | "admin";

type AuthState = {
  token: string;
  nickname: string;
};

type GameCard = {
  id: string;
  title: string;
  logo_base64: string;
  author_nickname: string;
  orientation: "portrait" | "landscape";
  created_at: string;
};

type GameDetail = GameCard & {
  html_code: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type SourceData = {
  frontend_code: string;
  backend_code: string;
};

const AUTH_KEY = "progaming_auth";
const API_BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
const SPLASH_WORD = "PROGAMİNG";

function HtmlRunner({ html }: { html: string }) {
  if (Platform.OS === "web") {
    return (
      <View style={styles.webview}>
        {/* @ts-ignore */}
        <iframe
          srcDoc={html}
          style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#000" }}
          sandbox="allow-scripts allow-same-origin allow-popups"
          title="game-preview"
        />
      </View>
    );
  }

  return <WebView source={{ html }} originWhitelist={["*"]} style={styles.webview} />;
}

export default function Index() {
  const [stage, setStage] = useState<Stage>("splash");
  const [auth, setAuth] = useState<AuthState | null>(null);

  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [editorCode, setEditorCode] = useState(`<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Yeni Oyun</title>
    <style>
      body { margin: 0; display: flex; align-items: center; justify-content: center; background: #111827; color: white; font-family: sans-serif; }
      button { padding: 16px 24px; background: #2563eb; border: none; border-radius: 12px; color: white; }
    </style>
  </head>
  <body>
    <button onclick="alert('Oyun başladı!')">Başlat</button>
  </body>
</html>`);
  const [editorError, setEditorError] = useState("");
  const [editorOrientation, setEditorOrientation] = useState<"portrait" | "landscape">("portrait");

  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [publishStep, setPublishStep] = useState<"title" | "logo">("title");
  const [publishTitle, setPublishTitle] = useState("");
  const [publishLogo, setPublishLogo] = useState("");
  const [publishError, setPublishError] = useState("");
  const [publishLoading, setPublishLoading] = useState(false);

  const [games, setGames] = useState<GameCard[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [selectedGame, setSelectedGame] = useState<GameDetail | null>(null);
  const [playerLoading, setPlayerLoading] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [latestAICode, setLatestAICode] = useState("");

  const [adminModalVisible, setAdminModalVisible] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [sourceData, setSourceData] = useState<SourceData | null>(null);

  const letterAnimations = useRef(
    SPLASH_WORD.split("").map(() => new Animated.Value(0))
  ).current;
  const scatterX = useRef(SPLASH_WORD.split("").map(() => Math.random() * 180 - 90)).current;
  const scatterY = useRef(SPLASH_WORD.split("").map(() => Math.random() * 220 - 110)).current;

  const lineCount = useMemo(() => editorCode.split("\n").length, [editorCode]);

  const apiRequest = useCallback(
    async <T = Record<string, any>>(path: string, method = "GET", body?: Record<string, unknown>) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (auth?.token) {
        headers["x-auth-token"] = auth.token;
      }

      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      let jsonBody: Record<string, any> | null = null;
      let textBody = "";
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        try {
          jsonBody = await response.json();
        } catch {
          jsonBody = null;
        }
      } else {
        textBody = await response.text();
      }

      if (!response.ok) {
        const errorMessage =
          jsonBody?.detail ||
          jsonBody?.message ||
          textBody ||
          `Sunucu hatası (${response.status})`;
        throw new Error(errorMessage);
      }

      return (jsonBody ?? { message: textBody }) as T;
    },
    [auth?.token]
  );

  useEffect(() => {
    letterAnimations.forEach((anim) => anim.setValue(0));
    Animated.parallel(
      letterAnimations.map((anim, index) =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 1100,
          delay: index * 75,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        })
      )
    ).start();

    const timer = setTimeout(async () => {
      const cached = await AsyncStorage.getItem(AUTH_KEY);
      if (cached) {
        const parsed: AuthState = JSON.parse(cached);
        setAuth(parsed);
        setStage("home");
      } else {
        setStage("authChoice");
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [letterAnimations]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (stage === "library") {
      fetchGames();
      interval = setInterval(fetchGames, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== "ai") return;
    const heartbeat = setInterval(() => {
      fetch(`${API_BASE}/ai/heartbeat`).catch(() => undefined);
    }, 10000);

    return () => clearInterval(heartbeat);
  }, [stage]);

  useEffect(() => {
    if (stage !== "player" || !selectedGame?.orientation) return;

    const lockOrientation = async () => {
      if (selectedGame.orientation === "landscape") {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    };

    lockOrientation().catch(() => undefined);

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, [selectedGame?.orientation, stage]);

  const handleRegister = async () => {
    if (nickname.trim().length < 7 || password.trim().length < 7) {
      setAuthError("en az 7 rakam veya harf");
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    try {
      const data = await apiRequest("/auth/register", "POST", {
        nickname: nickname.trim(),
        password: password.trim(),
      });
      const newAuth: AuthState = { token: data.token, nickname: data.nickname };
      setAuth(newAuth);
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(newAuth));
      setStage("home");
      setNickname("");
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Kayıt başarısız");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const data = await apiRequest("/auth/login", "POST", {
        nickname: nickname.trim(),
        password: password.trim(),
      });
      const newAuth: AuthState = { token: data.token, nickname: data.nickname };
      setAuth(newAuth);
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(newAuth));
      setStage("home");
      setNickname("");
      setPassword("");
    } catch (error) {
      setAuthError("yanlış şifre tekrar girin");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoPreview = () => {
    setEditorError("");
    if (!editorCode.toLowerCase().includes("<html") && !editorCode.toLowerCase().includes("<!doctype html")) {
      setEditorError("Sadece HTML5 kodu kabul edilir");
      return;
    }
    if (lineCount > 1000) {
      setEditorError("En fazla 1000 satır HTML5 kod yazabilirsin");
      return;
    }
    setStage("preview");
  };

  const openPublishModal = () => {
    setPublishModalVisible(true);
    setPublishStep("title");
    setPublishError("");
    setPublishLogo("");
  };

  const validateTitleStep = () => {
    Keyboard.dismiss();
    const cleanTitle = publishTitle.trim();
    const len = cleanTitle.length;
    if (len > 30) {
      setPublishError("en fazla otuz rakam veya harf");
      return;
    }
    if (len < 10) {
      setPublishError("rütven daha fazla yazınız");
      return;
    }
    setPublishError("");
    setPublishTitle(cleanTitle);
    setPublishStep("logo");
  };

  const pickLogo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPublishError("Galeri izni gerekli");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
      allowsMultipleSelection: false,
    });

    if (!result.canceled && result.assets[0]?.base64) {
      setPublishLogo(result.assets[0].base64);
      setPublishError("");
    }
  };

  const handlePublish = async () => {
    if (!publishLogo) {
      setPublishError("Logo seçmeden yayınla aktif olmaz");
      return;
    }

    setPublishLoading(true);
    setPublishError("");
    try {
      await apiRequest("/games/publish", "POST", {
        title: publishTitle.trim(),
        html_code: editorCode,
        logo_base64: publishLogo,
        orientation: editorOrientation,
      });
      setPublishModalVisible(false);
      setPublishTitle("");
      setPublishLogo("");
      setStage("home");
      Alert.alert("Başarılı", "Oyunun yayınlandı");
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Yayınlanamadı");
    } finally {
      setPublishLoading(false);
    }
  };

  const fetchGames = async () => {
    try {
      setGamesLoading(true);
      const data = await apiRequest<GameCard[]>("/games");
      setGames(data);
    } catch {
      setGames([]);
    } finally {
      setGamesLoading(false);
    }
  };

  const openGame = async (gameId: string) => {
    setStage("player");
    setPlayerLoading(true);
    try {
      const data = await apiRequest<GameDetail>(`/games/${gameId}`);
      setSelectedGame(data);
    } catch {
      setSelectedGame(null);
    } finally {
      setPlayerLoading(false);
    }
  };

  const sendPrompt = async () => {
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    setChatInput("");
    setChatLoading(true);
    setChatMessages((prev) => [...prev, { role: "user", text: userText }]);

    try {
      const data = await apiRequest("/ai/chat", "POST", {
        prompt: userText,
        session_id: `${auth?.nickname}-session`,
      });

      setChatMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
      if (data.html_code) {
        setLatestAICode(data.html_code);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI bağlantısı kurulamadı";
      setChatMessages((prev) => [...prev, { role: "assistant", text: `Hata: ${message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const openAdminPanel = async () => {
    setAdminLoading(true);
    setAdminError("");
    try {
      const data = await apiRequest<SourceData>("/admin/source", "POST", { password: adminPassword.trim() });
      setSourceData(data);
      setAdminModalVisible(false);
      setStage("admin");
      setAdminPassword("");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Şifre yanlış");
    } finally {
      setAdminLoading(false);
    }
  };

  const moveCodeToEditor = () => {
    if (!latestAICode) return;
    setEditorCode(latestAICode);
    setStage("editor");
  };

  const logout = async () => {
    await AsyncStorage.removeItem(AUTH_KEY);
    setAuth(null);
    setStage("authChoice");
  };

  if (stage === "splash") {
    return (
      <SafeAreaView style={styles.splashContainer}>
        <View style={styles.splashWordContainer}>
          {SPLASH_WORD.split("").map((letter, index) => (
            <Animated.Text
              key={`${letter}-${index}`}
              style={[
                styles.splashLetter,
                {
                  opacity: letterAnimations[index].interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 0.3],
                  }),
                  transform: [
                    {
                      translateX: letterAnimations[index].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, scatterX[index]],
                      }),
                    },
                    {
                      translateY: letterAnimations[index].interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, scatterY[index]],
                      }),
                    },
                    {
                      scale: letterAnimations[index].interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.7],
                      }),
                    },
                  ],
                },
              ]}
            >
              {letter}
            </Animated.Text>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (stage === "authChoice" || stage === "register" || stage === "login") {
    const isRegister = stage === "register";
    const isLogin = stage === "login";

    return (
      <SafeAreaView style={styles.authPage}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flexOne}
        >
          <Pressable style={styles.flexOne} onPress={Keyboard.dismiss}>
            <View style={styles.authContainer}>
              <Text style={styles.authTitle}>PROGAMİNG</Text>
              <Text style={styles.authSubtitle}>Mavi panel + siyah arka plan</Text>

              {stage === "authChoice" && (
                <View style={styles.choiceButtonsWrap}>
                  <TouchableOpacity
                    testID="auth-choice-register-button"
                    style={styles.primaryButton}
                    onPress={() => setStage("register")}
                  >
                    <Text style={styles.primaryButtonText}>Kayıt Ol</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="auth-choice-login-button"
                    style={styles.secondaryButton}
                    onPress={() => setStage("login")}
                  >
                    <Text style={styles.secondaryButtonText}>Giriş Yap</Text>
                  </TouchableOpacity>
                </View>
              )}

              {(isRegister || isLogin) && (
                <View style={styles.formWrap}>
                  <Text style={styles.label}>Takma İsim</Text>
                  <TextInput
                    testID="auth-nickname-input"
                    style={styles.input}
                    value={nickname}
                    onChangeText={setNickname}
                    placeholder="En az 7 karakter"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                  />

                  <Text style={styles.label}>Şifre</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      testID="auth-password-input"
                      style={styles.passwordInput}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="En az 7 karakter"
                      placeholderTextColor="#94a3b8"
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      testID="auth-password-toggle"
                      style={styles.iconButton}
                      onPress={() => setShowPassword((prev) => !prev)}
                    >
                      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  {!!authError && <Text style={styles.errorText}>{authError}</Text>}

                  <TouchableOpacity
                    testID={isRegister ? "register-submit-button" : "login-submit-button"}
                    style={[styles.primaryButton, authLoading && styles.disabledButton]}
                    onPress={isRegister ? handleRegister : handleLogin}
                    disabled={authLoading}
                  >
                    {authLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>{isRegister ? "Kayıt Ol" : "Giriş Yap"}</Text>
                    )}
                  </TouchableOpacity>

           
