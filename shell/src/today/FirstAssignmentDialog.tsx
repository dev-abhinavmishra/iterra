import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Dialog, Input } from '../ui/primitives';
import { execCommand } from '../integration/commands';
import { todayISO } from '../apps/rhythm/lib/dates';

export interface FirstAssignmentCourseOption {
  code: string;
  name?: string;
}

interface FirstAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  courses?: FirstAssignmentCourseOption[];
  initialCourse?: string;
  repeatCapture?: boolean;
  onSaved?: (title: string) => void;
}

export function FirstAssignmentDialog({ open, onClose, courses = [], initialCourse = '', repeatCapture = false, onSaved }: FirstAssignmentDialogProps) {
  const [title, setTitle] = useState('');
  const [course, setCourse] = useState('');
  const [dueDate, setDueDate] = useState(todayISO());
  const [minutes, setMinutes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setCourse(initialCourse);
    setDueDate(todayISO());
    setMinutes('');
    setError('');
    setSaving(false);
  }, [open, initialCourse]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const estimatedMinutes = minutes.trim() ? Number(minutes) : undefined;
    if (estimatedMinutes !== undefined && (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0)) {
      setError('Enter an estimate greater than zero minutes, or leave it blank.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await execCommand<{ commitmentId: string }>('createCommitment', {
        title: title.trim(),
        course: course.trim() || undefined,
        dueDate,
        estimatedMinutes,
      });
      if (!result.ok) {
        setError(result.error || 'Could not file the assignment. Try again.');
        setSaving(false);
        return;
      }
      onSaved?.(title.trim());
      onClose();
    } catch {
      setError('Could not file the assignment. Try again.');
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title={repeatCapture ? 'Add assignment' : 'Add your first assignment'}
      subtitle={repeatCapture ? 'File a deadline in Planning and keep working here.' : 'One deadline is enough — no full schedule import required.'}
      maxWidth="max-w-md"
    >
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <label className="block text-[12px] font-medium text-[var(--color-mute)]">
          Assignment title
          <Input
            className="mt-1"
            aria-label="Assignment title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Biology quiz"
            required
            autoFocus
          />
        </label>
        <label className="block text-[12px] font-medium text-[var(--color-mute)]">
          Course <span className="font-normal text-[var(--color-faint)]">(optional)</span>
          <Input
            className="mt-1"
            aria-label="Course"
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            placeholder="BIO 101 or Biology"
            list={courses.length ? 'first-assignment-courses' : undefined}
          />
          {courses.length > 0 && (
            <datalist id="first-assignment-courses">
              {courses.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </datalist>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[12px] font-medium text-[var(--color-mute)]">
            Due date
            <Input
              className="mt-1"
              aria-label="Due date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              required
            />
          </label>
          <label className="block text-[12px] font-medium text-[var(--color-mute)]">
            Estimate <span className="font-normal text-[var(--color-faint)]">(minutes)</span>
            <Input
              className="mt-1"
              aria-label="Estimate minutes"
              type="number"
              min={1}
              step={1}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              placeholder="60"
            />
          </label>
        </div>
        {error && <p role="alert" className="text-[12px] text-[var(--color-bad)]">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving || !title.trim() || !dueDate}>
            {saving ? 'Filing…' : 'Add assignment'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
