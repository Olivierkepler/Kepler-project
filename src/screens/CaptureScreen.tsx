import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../auth/AuthProvider';
import type {
  MainTabParamList,
  RootStackParamList,
} from '../navigation/types';
import OrbGlow from '../components/visuals/OrbGlow';
import { getProjects } from '../store/projects';
import type { Project } from '../types/project';
import { typography } from '../theme/colors';

type CaptureAction = 'photo' | 'measurement' | 'note' | 'progress';

type CaptureOption = {
  id: string;
  action?: CaptureAction;
  icon: string;
  title: string;
  description: string;
};

type CaptureTabProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Capture'>,
  NativeStackScreenProps<RootStackParamList>
>;

type CaptureProjectProps = NativeStackScreenProps<
  RootStackParamList,
  'CaptureProject'
>;

type CaptureWorkspaceProps = NativeStackScreenProps<
  RootStackParamList,
  'CaptureWorkspace'
>;

type Props = CaptureTabProps | CaptureProjectProps | CaptureWorkspaceProps;

function isCaptureProjectProps(props: Props): props is CaptureProjectProps {
  return props.route.name === 'CaptureProject';
}

function isCaptureStackProps(
  props: Props,
): props is CaptureProjectProps | CaptureWorkspaceProps {
  return props.route.name === 'CaptureProject' || props.route.name === 'CaptureWorkspace';
}

export default function CaptureScreen(props: Props) {
  const { user } = useAuth();
  const projectId = isCaptureProjectProps(props)
    ? props.route.params.projectId
    : undefined;

  const [pendingAction, setPendingAction] =
    useState<CaptureAction | null>(null);
  const [projectPickerVisible, setProjectPickerVisible] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState(false);
  const [failedProjectImages, setFailedProjectImages] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!projectPickerVisible) {
      return;
    }

    let active = true;
    setProjectsLoading(true);
    setProjectsError(false);

    if (!user?.uid) {
      setProjects([]);
      setProjectsLoading(false);
      return () => {
        active = false;
      };
    }

    void getProjects(user.uid)
      .then((items) => {
        if (active) {
          setProjects(items);
        }
      })
      .catch(() => {
        if (active) {
          setProjects([]);
          setProjectsError(true);
        }
      })
      .finally(() => {
        if (active) {
          setProjectsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [projectPickerVisible, user?.uid]);

  const navigateForCaptureAction = (
    action: CaptureAction,
    resolvedProjectId: string,
  ) => {
    // Both screen variants include the root stack in their navigation type.
    const rootNavigation = props.navigation as CaptureProjectProps['navigation'];
    switch (action) {
      case 'photo':
        rootNavigation.navigate('AddEvidence', {
          projectId: resolvedProjectId,
          mode: 'photo',
        });
        return;
      case 'measurement':
        rootNavigation.navigate('Measurement', {
          projectId: resolvedProjectId,
        });
        return;
      case 'note':
        rootNavigation.navigate('AddEvidence', {
          projectId: resolvedProjectId,
          mode: 'note',
        });
        return;
      case 'progress':
        rootNavigation.navigate('WorkProgress', {
          projectId: resolvedProjectId,
        });
    }
  };

  const startCaptureAction = (action: CaptureAction) => {
    if (projectId) {
      navigateForCaptureAction(action, projectId);
      return;
    }

    setPendingAction(action);
    setProjectPickerVisible(true);
  };

  const cancelProjectPicker = () => {
    setProjectPickerVisible(false);
    setPendingAction(null);
  };

  const selectProject = (project: Project) => {
    const action = pendingAction;
    setProjectPickerVisible(false);
    setPendingAction(null);

    if (action) {
      navigateForCaptureAction(action, project.id);
    }
  };

  const goBack = () => {
    if (isCaptureStackProps(props)) {
      props.navigation.goBack();
    }
  };

  const captureOptions: CaptureOption[] = [
    {
      id: 'photo',
      action: 'photo',
      icon: '📷',
      title: 'Photo',
      description: 'Capture site conditions',
    },
    {
      id: 'voice-note',
      icon: '🎙',
      title: 'Voice Note',
      description: 'Describe what happened',
    },
    {
      id: 'measurement',
      action: 'measurement',
      icon: '📐',
      title: 'Measurement',
      description: 'Record field dimensions',
    },
    {
      id: 'field-note',
      action: 'note',
      icon: '📝',
      title: 'Field Note',
      description: 'Document an observation',
    },
    {
      id: 'progress-update',
      action: 'progress',
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
        {isCaptureStackProps(props) && (
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
              key={option.id}
              style={styles.option}
              onPress={option.action
                ? () => startCaptureAction(option.action!)
                : undefined}
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

      <Modal
        visible={projectPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelProjectPicker}
      >
        <View style={styles.pickerOverlay}>
          <Pressable
            style={styles.pickerBackdrop}
            onPress={cancelProjectPicker}
            accessibilityRole="button"
            accessibilityLabel="Cancel project selection"
          />

          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Select project</Text>
            <Text style={styles.pickerSubtitle}>
              Choose where this field evidence belongs.
            </Text>

            {projectsLoading ? (
              <View style={styles.pickerMessage}>
                <ActivityIndicator color="#012169" />
              </View>
            ) : projectsError ? (
              <Text style={styles.pickerMessageText}>
                Projects could not be loaded. Cancel and try again.
              </Text>
            ) : projects.length === 0 ? (
              <Text style={styles.pickerMessageText}>
                No projects are available. Create or join a project before
                capturing field data.
              </Text>
            ) : (
              <ScrollView
                style={styles.projectPickerList}
                showsVerticalScrollIndicator={false}
              >
                {projects.map((project) => {
                  const avatarUri = project.avatarUri?.trim();
                  const showProjectImage =
                    !!avatarUri && !failedProjectImages.has(project.id);

                  return (
                    <Pressable
                      key={project.id}
                      onPress={() => selectProject(project)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${project.name}`}
                      style={({ pressed }) => [
                        styles.projectPickerRow,
                        pressed && styles.projectPickerRowPressed,
                      ]}
                    >
                      <View style={styles.projectPickerAvatar}>
                        {showProjectImage ? (
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.projectPickerImage}
                            onError={() =>
                              setFailedProjectImages((current) => {
                                const next = new Set(current);
                                next.add(project.id);
                                return next;
                              })
                            }
                          />
                        ) : (
                          <Ionicons
                            name="business-outline"
                            size={22}
                            color="#012169"
                          />
                        )}
                      </View>
                      <View style={styles.projectPickerCopy}>
                        <Text
                          style={styles.projectPickerName}
                          numberOfLines={1}
                        >
                          {project.name}
                        </Text>
                        {project.location.trim() ? (
                          <Text
                            style={styles.projectPickerLocation}
                            numberOfLines={1}
                          >
                            {project.location}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#98A2B3"
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <Pressable
              onPress={cancelProjectPicker}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={({ pressed }) => [
                styles.pickerCancel,
                pressed && styles.pickerCancelPressed,
              ]}
            >
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

  pickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(5, 10, 18, 0.56)',
  },

  pickerBackdrop: {
    ...StyleSheet.absoluteFill,
  },

  pickerCard: {
    width: '100%',
    maxHeight: '78%',
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },

  pickerTitle: {
    color: '#101828',
    ...typography.title,
  },

  pickerSubtitle: {
    color: '#667085',
    ...typography.body,
    marginTop: 5,
    marginBottom: 12,
  },

  projectPickerList: {
    flexGrow: 0,
  },

  projectPickerRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E7EC',
  },

  projectPickerRowPressed: {
    backgroundColor: '#F5F7FA',
  },

  projectPickerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(1, 33, 105, 0.08)',
  },

  projectPickerImage: {
    width: '100%',
    height: '100%',
  },

  projectPickerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },

  projectPickerName: {
    color: '#101828',
    ...typography.bodyMedium,
  },

  projectPickerLocation: {
    color: '#667085',
    ...typography.caption,
    marginTop: 2,
  },

  pickerMessage: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pickerMessageText: {
    color: '#667085',
    ...typography.body,
    textAlign: 'center',
    paddingVertical: 20,
  },

  pickerCancel: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E4E7EC',
  },

  pickerCancelPressed: {
    opacity: 0.7,
  },

  pickerCancelText: {
    color: '#012169',
    ...typography.button,
  },
});
