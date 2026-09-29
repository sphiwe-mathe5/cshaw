import logging
from io import BytesIO
from django.template.loader import get_template
from xhtml2pdf import pisa

logger = logging.getLogger(__name__)

def render_to_pdf(template_src, context_dict):
    try:
        template = get_template(template_src)
        html = template.render(context_dict)
        result = BytesIO()
        pdf = pisa.pisaDocument(
            BytesIO(html.encode("utf-8")),
            result,
            encoding='utf-8'
        )
        if not pdf.err:
            return result.getvalue()
        logger.error("xhtml2pdf error rendering %s: %s", template_src, pdf.err)
        return None
    except Exception as e:
        logger.error("Exception in render_to_pdf for %s: %s", template_src, e, exc_info=True)
        return None