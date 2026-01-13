export type CommChannel = 'email' | 'sms' | 'in_app';
export type CommRecipientType = 'client' | 'user' | 'custom';
export type CommDeliveryMode = 'instant' | 'digest';

export type RecipientRules = {
  to_client?: boolean;
  to_assigned_staff?: boolean;
  to_all_staff?: boolean;
  to_roles?: string[];
  to_specific_user_ids?: string[];
  to_site_contacts?: boolean;
  additional_emails?: string[];
};

export type TimingRules = {
  immediate?: boolean;
  delay_minutes?: number;
  delay_hours?: number;
  scheduled_at?: string;
};

export type CommEventInput = {
  orgId: string;
  eventKey: string;
  entityType: string;
  entityId: string;
  triggeredByUserId?: string | null;
  source?: 'app' | 'cron' | 'api' | 'import' | 'integration' | string;
  payload?: Record<string, unknown>;
  actorRoleKey?: string | null;
};
