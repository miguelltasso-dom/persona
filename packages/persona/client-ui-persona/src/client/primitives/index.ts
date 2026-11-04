/** Shared Persona UI primitives — DESIGN-SYSTEM.md §5 (Muse). */

export { Button, IconButton, type ButtonProps, type ButtonSize, type ButtonVariant, type IconButtonProps } from './Button.tsx'
export { Card, Eyebrow, type CardProps } from './Card.tsx'
export { Screen, ScreenHeader, type ScreenHeaderProps, type ScreenProps } from './Screen.tsx'
export { Input, Textarea, type InputProps, type TextareaProps } from './Field.tsx'
export { Chip, ReactionChip, type ChipProps, type ChipTone, type ReactionChipProps } from './Chip.tsx'
export { Avatar, type AvatarPresence, type AvatarProps, type AvatarSize } from './Avatar.tsx'
export { Tabs, type TabItem, type TabsProps } from './Tabs.tsx'
export { MenuButton, type MenuButtonHandle, type MenuButtonProps, type MenuItem } from './MenuButton.tsx'
export { useActiveIndicator, type ActiveIndicatorBox } from './use-active-indicator.ts'
export { Modal, Toast, ToastRegion, Tooltip, type ModalProps, type ToastProps, type ToastTone, type TooltipProps } from './Overlays.tsx'
export { DayDivider, EmptyState, Skeleton, type EmptyStateProps, type SkeletonProps } from './Feedback.tsx'
export { HealthItem, HealthScore, OrgChart, TWO_DAY_ART, TwoDayTimeline, type HealthLevel, type OrgChartProps, type OrgGroup, type OrgPersona, type OrgPersonaState, type TwoDayOutcome, type TwoDayRow } from './Governance.tsx'
export { ApprovedStamp, MilestoneCard, PawBurst, usePawCelebration, type ApprovedStampProps, type MilestoneCardProps, type MilestoneContributor, type MilestoneStat } from './Celebration.tsx'
export { BoardColumn, BoardColumns, CategoryBar, SprintStrip, type BoardColumnProps, type CategoryCount, type SprintStripProps, type StageCategory } from './Board.tsx'
export { FixedRowVirtualScroller, type FixedRowVirtualScrollerProps } from './FixedRowVirtualScroller.tsx'
export { ErrorState, PanelBoundary, type ErrorStateProps, type PanelBoundaryProps } from './PanelBoundary.tsx'
export { BrandIcon, ColumnCategoryIcon, FlowIcon, SectorIcon, UiIcon, type BrandIconName, type FlowModelId, type SectorId, type StageCategoryIcon, type UiIconName } from './icons.tsx'
export { Accent, PawTrail, RailHills, Sparkle, Squiggle, TeamScene, type AccentProps } from './accents.tsx'
export { PersonaButton, type PersonaButtonProps, type PersonaButtonVariant } from './PersonaButton.tsx'
export { PersonaMuted, PersonaPanel, type PersonaPanelProps } from './PersonaPanel.tsx'
export { StaggerEntrance, type StaggerEntranceProps } from './StaggerEntrance.tsx'
export {
  NOW_POSE,
  PersonaCard,
  PersonaCardFacts,
  PersonaCardPopover,
  QuotaMeter,
  usePersonaCardController,
  type PersonaCardBadge,
  type PersonaCardController,
  type PersonaCardEngine,
  type PersonaCardFact,
  type PersonaCardFactsProps,
  type PersonaCardLabels,
  type PersonaCardMenuItem,
  type PersonaCardNow,
  type PersonaCardPopoverProps,
  type PersonaCardProps,
  type PersonaCardQuota,
  type PersonaCardTalk,
  type PersonaCardTriggerProps,
  type PersonaNowKind,
  type PersonaPresence,
} from './PersonaCard.tsx'
export { REACTION_EMOJI, REACTION_IDS, StickerPicker, stickerUrl, type ReactionId, type StickerPickerProps } from './Stickers.tsx'
export { ACCOUNT_POLICIES, AccountList, AccountPolicyPicker, AccountRow, Notice, type AccountPolicy, type AccountPolicyPickerProps, type AccountRowProps, type AccountState, type AccountUser, type NoticeProps } from './Accounts.tsx'
export { RecordingFrame, RecordingPill, TeachStepCard, TeachStepList, formatElapsed, type RecordingPillProps, type RecordingState, type TeachStepCardProps } from './Teach.tsx'
export { ChoiceCards, type ChoiceCardOption, type ChoiceCardsProps } from './ChoiceCards.tsx'
export { ActionReplay, PersonaCursor, type ActionReplayProps, type CursorPersona, type PersonaCursorProps, type PersonaCursorState, type ReplayStep, type ReplayStepKind } from './PersonaCursor.tsx'
export { arcPath, arcPathData, bezierPoint, cursorAt, minJerk, moveDuration, totalMoveMs, type ArcPath, type Point } from './cursor-motion.ts'
export { AI_SOURCES, CopyPrompt, FolderDrop, PasteBox, ProposalReview, defaultChoice, type AiSource, type ContextProposal, type CopyPromptProps, type FolderDropProps, type FolderDropState, type PasteBoxProps, type PastedSource, type ProposalChoice, type ProposalKind, type ProposalReviewProps } from './BringContext.tsx'
export { ChangeFeed, ContradictionCard, PERMISSION_VALIDITIES, PageMeta, PermissionRow, RememberPermission, type ChangeItem, type ContradictionCardProps, type PageLink, type PageMetaProps, type PageProperty, type PageVersion, type PermissionRowProps, type PermissionScope, type PermissionValidity, type RememberPermissionProps } from './Brain.tsx'
export { GestorPlanCard, GestorSettings, type GestorApproval, type GestorLimitsValue, type GestorPlanCardProps, type GestorPlanStep, type GestorSettingsProps, type GestorStepKind } from './Gestor.tsx'
export { ORG_MAP_LABELS_PT, OrgMap, columnsFor, type OrgMapLabels, type OrgMapProps } from './OrgMap.tsx'
export { ActivityGroup, PooledQuotaBar, summarizeActivity, type ActivityGroupProps, type ActivityItem, type ActivityKind, type ActivityStatus, type PooledAccount, type PooledQuotaBarProps } from './Pooled.tsx'
export { Switch, type SwitchProps } from './Switch.tsx'
export { ABOUT_LABELS_EN, ABOUT_LABELS_PT, AboutPersona, PERSONA_CREDITS, type AboutLabels, type AboutPersonaProps, type CreditEntry } from './About.tsx'
export { HelpArticle, markSegments, type HelpArticleProps } from './HelpArticle.tsx'
export { RunErrorCard, type RunErrorCardProps } from './RunErrorCard.tsx'
export { describeResetTime, describeRunError, legacyRunErrorFromText, runErrorText, type RunErrorAction, type RunErrorCode, type RunErrorDescription, type RunErrorPayload } from './run-errors.ts'
