import React from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type {
  MainTabParamList,
  RootStackParamList,
} from '../navigation/types';
import OrbGlow from '../components/visuals/OrbGlow';
import { typography } from '../theme/colors';

type CaptureTabProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Capture'>,
  NativeStackScreenProps<RootStackParamList>
>;

type CaptureProjectProps = NativeStackScreenProps<
  RootStackParamList,
  'CaptureProject'
>;

type Props = CaptureTabProps | CaptureProjectProps;

function isCaptureProjectProps(props: Props): props is CaptureProjectProps {
  return props.route.name === 'CaptureProject';
}

export default function CaptureScreen(props: Props) {
  const projectId = isCaptureProjectProps(props)
    ? props.route.params.projectId
    : undefined;

  const openMeasurement = () => {
    if (!projectId) {
      Alert.alert(
        'Select a project first',
        'Measurements must be associated with a project. Open a project before recording a field measurement.',
      );
      return;
    }

    if (isCaptureProjectProps(props)) {
      props.navigation.navigate('Measurement', { projectId });
      return;
    }

    props.navigation.navigate('Measurement', { projectId });
  };

  const goBack = () => {
    if (isCaptureProjectProps(props)) {
      props.navigation.goBack();
    }
  };

  const captureOptions = [
    {
      icon: '📷',
      title: 'Photo',
      description: 'Capture site conditions',
    },
    {
      icon: '🎙',
      title: 'Voice Note',
      description: 'Describe what happened',
    },
    {
      icon: '📐',
      title: 'Measurement',
      description: 'Record field dimensions',
    },
    {
      icon: '📝',
      title: 'Field Note',
      description: 'Document an observation',
    },
    {
      icon: '📊',
      title: 'Progress Update',
      description: 'Report installed quantities',
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {isCaptureProjectProps(props) && (
          <View style={styles.topBar}>
            <Pressable
              style={styles.backButton}
              onPress={goBack}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Text style={styles.backButtonText}>←</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.eyebrow}>
          FIELD EVIDENCE
        </Text>

        <Text style={styles.title}>
          Capture Field Reality
        </Text>

        <Text style={styles.description}>
          Record what is actually happening on the jobsite.
          BUILDSIGMA will organize the evidence and compare it
          against the project plan.
        </Text>

        <View style={styles.options}>
          {captureOptions.map((option) => (
            <Pressable
              key={option.title}
              style={styles.option}
              onPress={
                option.title === 'Measurement' ? openMeasurement : undefined
              }
            >
              <Text style={styles.icon}>
                {option.icon}
              </Text>

              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>
                  {option.title}
                </Text>

                <Text style={styles.optionDescription}>
                  {option.description}
                </Text>
              </View>

              <Text style={styles.arrow}>→</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.intelligenceCard}>
          <Text style={styles.intelligenceLabel}>
            BUILDSIGMA INTELLIGENCE
          </Text>

          <Text style={styles.intelligenceText}>
            Evidence captured here can be compared with scope,
            quantities, estimates, and schedule information to
            identify project deltas.
          </Text>
        </View>

        {/* <OrbGlow
  size={100}
  animated
/> */}



      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B1017',
  },

  container: {
    flex: 1,
    backgroundColor: '#0B1017',
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 50,
  },

  topBar: {
    paddingTop: 16,
    marginBottom: 18,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#151C25',
    borderWidth: 1,
    borderColor: '#27313D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backButtonText: {
    color: '#FFFFFF',
    ...typography.title,
  },

  eyebrow: {
    color: '#F4A623',
    ...typography.caption,
    marginTop: 8,
  },

  title: {
    color: '#FFFFFF',
    ...typography.display,
    marginTop: 8,
  },

  description: {
    color: '#9AA5B1',
    ...typography.bodyLarge,
    marginTop: 12,
  },

  options: {
    marginTop: 26,
  },

  option: {
    backgroundColor: '#151C25',
    borderColor: '#27313D',
    borderWidth: 1,
    borderRadius: 14,
    padding: 17,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },

  icon: {
    fontSize: 28,
    width: 45,
  },

  optionContent: {
    flex: 1,
  },

  optionTitle: {
    color: '#FFFFFF',
    ...typography.bodyLarge,
  },

  optionDescription: {
    color: '#7D8996',
    marginTop: 3,
    ...typography.button,
    fontFamily: 'Poppins_400Regular',
  },

  arrow: {
    color: '#F4A623',
    fontSize: 22,
  },

  intelligenceCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#F4A623',
    backgroundColor: '#111820',
    padding: 16,
    marginTop: 16,
    marginBottom: 50,
  },

  intelligenceLabel: {
    color: '#F4A623',
    ...typography.metadata,
  },

  intelligenceText: {
    color: '#9AA5B1',
    ...typography.body,
    marginTop: 7,
  },
});
