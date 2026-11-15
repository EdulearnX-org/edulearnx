import type { DatabaseCourse } from '@/hooks/useCourses';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
export default function EnrollmentRequestDialog({course,open,onClose}:{course:DatabaseCourse|null;open:boolean;onClose:()=>void}) {
  return <Dialog open={open && !!course} onOpenChange={value=>{if(!value)onClose();}}><DialogContent><DialogHeader><DialogTitle>Enroll in {course?.title}</DialogTitle><DialogDescription>View payment instructions and submit your receipt securely. Enrollment is granted after admin approval.</DialogDescription></DialogHeader><Link className="btn-primary text-center" onClick={onClose} to={`/checkout/${course?.id}`}>Continue to checkout</Link></DialogContent></Dialog>;
}
