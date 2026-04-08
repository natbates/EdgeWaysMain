import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  useWindowDimensions,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { colorScheme } from '../constants/colorScheme';
import HomeScreen from '../screens/HomeScreen';
import SessionsScreen from '../screens/SessionsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import TroubleshootScreen from '../screens/TroubleshootScreen';

const PAGES = [
  { key: 'home', title: 'Home', icon: 'home-outline' },
  { key: 'sessions', title: 'Sessions', icon: 'music-circle-outline' },
  { key: 'settings', title: 'Settings', icon: 'cog-outline' },
  // { key: 'troubleshoot', title: 'Troubleshoot', icon: 'bug-outline' },
];

function HomePageContent() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [navWidth, setNavWidth] = useState(0);
  const [isSessionDetailOpen, setIsSessionDetailOpen] = useState(false);
  const [sessionBackFromSettings, setSessionBackFromSettings] = useState(false);

  const [isOuterScrollEnabled, setIsOuterScrollEnabled] = useState(true);
  const scrollX = useRef(new Animated.Value(0)).current;

  const navPadding = 18; // both left/right padding
  const innerWidth = navWidth ? navWidth - navPadding * 2 : 0; // 18px each side
  const bottomNavOffset = insets.bottom + 12; // leave room for home indicator / safe area
  const tabWidth = innerWidth / PAGES.length;
  const indicatorWidth = tabWidth * 0.8; // make the indicator longer
  const indicatorStyle = { width: indicatorWidth };

  const goToIndex = useCallback(
    (index: number) => {
      setActiveIndex(index);
      const ref = scrollRef.current;
      const scroller = ref?.getNode ? ref.getNode() : ref;
      scroller?.scrollTo?.({ x: index * width, animated: true });
    },
    [width],
  );

  const onMomentumScrollEnd = useCallback(
    (event: any) => {
      const newIndex = Math.round(event.nativeEvent.contentOffset.x / width);
      setActiveIndex(newIndex);
    },
    [width],
  );

  const showBottomNav = !isSessionDetailOpen && !sessionBackFromSettings;

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        scrollEnabled={isOuterScrollEnabled && !isSessionDetailOpen}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        scrollEventThrottle={16}
        style={styles.scroller}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.page, { width }]}>
          <HomeScreen onGetStarted={() => goToIndex(1)} />
        </View>
        <View style={[styles.page, { width }]}>
          <SessionsScreen
            onDetailOpen={() => setIsSessionDetailOpen(true)}
            onDetailClose={() => setIsSessionDetailOpen(false)}
            onChildHorizontalScrollStart={() => setIsOuterScrollEnabled(false)}
            onChildHorizontalScrollEnd={() => setIsOuterScrollEnabled(true)}
            onOpenSettingsFromSession={() => {
              setSessionBackFromSettings(true);
              setIsSessionDetailOpen(false);
              goToIndex(2);
            }}
            sessionPageHideBottomPadding={sessionBackFromSettings}
          />
        </View>
        <View style={[styles.page, { width }]}>
          <SettingsScreen
            showBackToSession={sessionBackFromSettings}
            onBackToSession={() => {
              setSessionBackFromSettings(false);
              setIsSessionDetailOpen(true);
              goToIndex(1);
            }}
          />
        </View>
        {/* <View style={[styles.page, { width }]}>
          <TroubleshootScreen />
        </View> */}
      </Animated.ScrollView>

      {showBottomNav ? (
        <View
          style={[styles.bottomNav, { bottom: bottomNavOffset }]}
          onLayout={event => setNavWidth(event.nativeEvent.layout.width)}
        >
          <Animated.View
            style={[
              styles.indicator,
              indicatorStyle,
              {
                transform: [
                  {
                    translateX: navWidth
                      ? scrollX.interpolate({
                          inputRange: PAGES.map((_, i) => i * width),
                          outputRange: PAGES.map(
                            (_, i) =>
                              18 + // left padding
                              i * tabWidth +
                              (tabWidth - indicatorWidth) / 2,
                          ),
                          extrapolate: 'clamp',
                        })
                      : 0,
                  },
                ],
              },
            ]}
          />

          {PAGES.map((page, index) => (
            <TouchableOpacity
              key={page.key}
              style={styles.tab}
              onPress={() => goToIndex(index)}
            >
              <MaterialCommunityIcons
                name={page.icon}
                size={26}
                color={
                  activeIndex === index
                    ? colorScheme.accent
                    : colorScheme.subText
                }
              />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colorScheme.background,
  },
  scroller: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    width: '60%',
    maxWidth: 300,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 44,
    backgroundColor: colorScheme.surface,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    alignItems: 'center',
  },
  indicator: {
    position: 'absolute',
    height: 44,
    borderRadius: 20,
    backgroundColor: 'rgba(141, 141, 141, 0.12)',
    top: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
  },
  scrollContent: {},
});

export default function HomePage() {
  return <HomePageContent />;
}
