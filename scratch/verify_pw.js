const bcrypt = require('bcryptjs');
const hash = '$2a$10$1OjMBBg1AjenfsZNjhkLFeJPg0wHn7E0AWDsJ8GgTb2WgtRSijzSm';
bcrypt.compare('admin123', hash).then(res => {
  console.log('Match:', res);
});
