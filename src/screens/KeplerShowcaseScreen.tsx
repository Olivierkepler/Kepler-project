import React, {
    useEffect,
    useRef,
  } from "react";
  import {
    Animated,
    Easing,
    ImageBackground,
    Pressable,
    StyleSheet,
    View,
  } from "react-native";
  import { Ionicons } from "@expo/vector-icons";
  import { useNavigation } from "@react-navigation/native";
  import { SafeAreaView } from "react-native-safe-area-context";
  
  import KeplerLogo from "../components/branding/KeplerLogo1";
  
  const backgroundImage = require("../../assets/bglog.png");
  
  export default function KeplerShowcaseScreen() {
    const navigation = useNavigation();
  
    const animation = useRef(
      new Animated.Value(0),
    ).current;
  
    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(animation, {
            toValue: 1,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
  
          Animated.timing(animation, {
            toValue: 0,
            duration: 1600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
  
      loop.start();
  
      return () => {
        loop.stop();
      };
    }, [animation]);
  
    const scale = animation.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.025],
    });
  
    const translateY = animation.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -4],
    });
  
    const opacity = animation.interpolate({
      inputRange: [0, 1],
      outputRange: [0.96, 1],
    });
  
    return (
      <ImageBackground
        source={backgroundImage}
        style={styles.background}
        resizeMode="cover"
      >
        <SafeAreaView style={styles.safeArea}>
          {/* Back button */}
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color="#012169"
            />
          </Pressable>
  
          {/* Kepler logo */}
          <View style={styles.container}>
            <Animated.View
              style={[
                styles.logoWrap,
                {
                  opacity,
                  transform: [
                    { translateY },
                    { scale },
                  ],
                },
              ]}
            >
              <KeplerLogo
                width={210}
                height={92}
                autoPlay
              />
        

            </Animated.View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }
  
  const styles = StyleSheet.create({
    background: {
      flex: 1,
      width: "100%",
      height: "100%",
    },
  
    safeArea: {
      flex: 1,
      backgroundColor: "transparent",
    },
  
    backButton: {
      position: "absolute",
      top: 58,
      left: 16,
      zIndex: 10,
  
      width: 44,
      height: 44,
      borderRadius: 22,
  
      alignItems: "center",
      justifyContent: "center",
  
      backgroundColor: "rgba(255,255,255,0.78)",
  
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(1,33,105,0.12)",
    },
  
    backButtonPressed: {
      opacity: 0.65,
    },
  
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
  
    logoWrap: {
      alignItems: "center",
      justifyContent: "center",
    },
  });