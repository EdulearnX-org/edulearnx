import { Link } from "react-router-dom";
import { Shield, AlertCircle, Mail } from "lucide-react";

export default function RefundPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
          <div className="text-center">
            <Shield className="mx-auto h-12 w-12 text-primary" />
            <h1 className="mt-4 text-3xl font-bold text-gray-900">Refund Policy</h1>
            <p className="mt-2 text-lg text-gray-600">Last updated: {new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* No Refund Alert */}
        <div className="bg-red-50 border-l-4 border-red-500 p-6 mb-8">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-semibold text-red-800">No Refund Policy</h3>
              <div className="mt-2 text-red-700">
                <p className="font-medium">All sales are final. We do not offer refunds for any courses.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-8 space-y-6">
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">All Sales Are Final</h2>
            <p className="text-gray-700 leading-relaxed">
              By purchasing any course on EduLearnX, you acknowledge and agree that all purchases are final and non-refundable. 
              Once payment is processed and you receive access to the course materials, we cannot provide a refund under any circumstances.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">What This Means</h2>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start">
                <svg className="h-5 w-5 text-red-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                No refunds for any reason, including but not limited to:
                <ul className="ml-6 mt-1 space-y-1 text-sm">
                  <li>• Change of mind</li>
                  <li>• Course not meeting expectations</li>
                  <li>• Technical issues on your end</li>
                  <li>• Inability to complete the course</li>
                </ul>
              </li>
              <li className="flex items-start">
                <svg className="h-5 w-5 text-red-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                No partial refunds or prorated refunds
              </li>
              <li className="flex items-start">
                <svg className="h-5 w-5 text-red-500 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                No exchanges or course transfers
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Before You Purchase</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We strongly recommend that you:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li>Review the course description and curriculum carefully</li>
              <li>Check the course level and prerequisites</li>
              <li>Ensure you have the necessary time to complete the course</li>
              <li>Verify your device meets technical requirements</li>
              <li>Contact us if you have any questions before purchasing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Course Access</h2>
            <p className="text-gray-700 leading-relaxed">
              After successful payment, you will receive immediate access to your purchased course. 
              This access includes all course materials, resources, and any updates we make to the course content. 
              Your access duration is as specified on the course page (lifetime access or specified period).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Exceptions</h2>
            <p className="text-gray-700 leading-relaxed">
              In the rare event that we are unable to deliver the course as advertised (e.g., service discontinuation), 
              we may, at our sole discretion, offer alternative solutions. This does not constitute a refund obligation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Contact Us</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have questions about our refund policy or need support, please contact us:
            </p>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Mail className="h-5 w-5 text-primary mr-2" />
                <div>
                  <p className="font-medium text-gray-900">Email Support</p>
                  <a href="mailto:support@edulearnx.org" className="text-primary hover:underline">
                    support@edulearnx.org
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-8">
          <Link
            to="/"
            className="inline-flex items-center text-primary hover:underline font-medium"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m0 0l11 11" />
            </svg>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
