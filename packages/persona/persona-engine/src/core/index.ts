/** Reusable proactive-agent core: model, ports, engine and in-memory repositories. */
export * from './model.ts'
export * from './ports.ts'
export { Engine, type EngineForExecutor, type EngineForMainSession, type EngineForPeople, type EngineForSettings, type EngineForSources,
  type EngineOptions, type EngineReadyOptions, type Outcome, type ReceiveOptions, type ReceiveResult, type Reply, type ReplyRequest, type WorkerReport } from './engine.ts'
export { ENGINE_TRIGGER_CONFIRM_AFTER_MS } from './availability.ts'
export { RECOVERY_NOTE } from './assignments.ts'
export {
  ASK_LABEL_MAX, ASK_MAX_OPTIONS, ASK_MAX_QUESTIONS, ASK_MIN_OPTIONS, ASK_QUESTION_MAX,
  AskError, applyAskAnswer, askInputOf, checkAskAnswer, describeAskAnswers, initialAsk, normalizeAskQuestions, optionIdOf,
  type AskAnswerInput, type AskFailure, type AskOptionInput, type AskQuestionInput,
} from './ask.ts'
export { UserError, USER_ERRORS, type UserErrorCode } from './errors.ts'
export { REASONS, reasonText, said, type Reason, type ReasonCode } from './reasons.ts'
export { MemoryRepositories } from './memory.ts'
export { canRetry, ticketStage, type TicketStage } from './stage.ts'
export { PERSONA_TOOL, key } from './ids.ts'
