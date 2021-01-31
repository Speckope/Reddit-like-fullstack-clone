import { Box, Button } from '@chakra-ui/react';
import { Formik, Form } from 'formik';
import { withUrqlClient } from 'next-urql';
import { useRouter } from 'next/router';
import React from 'react';
import { InputField } from '../../../components/InputField';
import { Layout } from '../../../components/Layout';
import { useUpdatePostMutation } from '../../../generated/graphql';
import { createUrqlClient } from '../../../utils/createUqrlClient';
import { useGetIntId } from '../../../utils/useGetIntId';
import { useGetPostFromUrl } from '../../../utils/useGetPostFromUrl';

// AFTER AN UPDATE, WE DON'T HAVE TO UPDATE THE CACHE
// urql ill do it for us, bc in our mutation we update and get post object back
const EditPost: React.FC = ({}) => {
  const router = useRouter();
  const intId = useGetIntId();

  const [{ data, fetching }] = useGetPostFromUrl();
  const [, updatePost] = useUpdatePostMutation();

  if (fetching) {
    return (
      <Layout>
        <div>Loading...</div>
      </Layout>
    );
  }

  //   if (error) {
  //     return <div>{error.message}</div>;
  //   }

  if (!data?.post) {
    return (
      <Layout>
        <Box>Could not find a post</Box>
      </Layout>
    );
  }

  return (
    <Layout variant='small'>
      <Formik
        initialValues={{ title: data.post.title, text: data.post.text }}
        onSubmit={async (values) => {
          await updatePost({ id: intId, ...values });
          //   router.push('/');
          router.back(); // This will take us to previous url we were before we entered edit post
          // We could also programm it to pass next page in query parameters to take us after submitting
        }}
      >
        {({ isSubmitting }) => (
          <Form>
            <InputField name='title' placeholder='title' label='Title' />

            <Box mt={4}>
              <InputField
                textarea
                name='text'
                placeholder='text...'
                label='Body'
              />
            </Box>

            <Button
              mt={3}
              type='submit'
              colorScheme='teal'
              isLoading={isSubmitting}
            >
              Update Post
            </Button>
          </Form>
        )}
      </Formik>
    </Layout>
  );
};
export default withUrqlClient(createUrqlClient)(EditPost);
