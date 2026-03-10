export interface UserInfo {
  id: string;
  username: string;
  role: 'student' | 'parent' | 'admin';
  full_name?: string;
}

export interface LoginResponse {
  access_token: string;
  user: UserInfo;
}

export interface Lesson {
  id: string;
  title: string;
  description?: string;
  file_url?: string;
  transcript?: string;
  created_at?: string;
}

export interface QuizQuestion {
  pytanie: string;
  odpowiedzi: string[];
  poprawna: string;
  wyjasnienie?: string;
}

export interface Quiz {
  id: string;
  lesson_id: string;
  questions_json: QuizQuestion[];
}

export interface QuizResultDetail {
  pytanie: string;
  odpowiedz_ucznia: string | null;
  poprawna_odpowiedz: string;
  czy_poprawna: boolean;
}

export interface QuizResult {
  id: string;
  quiz_id: string;
  user_id: string;
  score: number;
  max_score: number;
  details_json: QuizResultDetail[];
  completed_at?: string;
}

export interface Flashcard {
  przod: string;
  tyl: string;
}

export interface AnalysisResult {
  mocne_strony?: string;
  obszary_do_poprawy?: string;
  wskazowki?: string;
}

export interface AdminUser {
  id: string;
  username: string;
  full_name?: string;
  role: string;
  school_type?: 'liceum' | 'podstawowka';
  class?: string;
  created_at?: string;
}

export interface ProgressQuiz {
  id: string;
  questions: QuizQuestion[];
  results: QuizResult[];
}

export interface ProgressLesson {
  id: string;
  title: string;
  description?: string;
  created_at?: string;
  quizzes: ProgressQuiz[];
}

export interface StudentProgress {
  lessons: ProgressLesson[];
}
